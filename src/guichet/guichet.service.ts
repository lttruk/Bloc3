import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { toString as qrEnSvg } from 'qrcode';
import { CodeQrService } from '../billets/code-qr.service';
import { PrismaService } from '../prisma/prisma.service';
import { placesDeLaSeance } from '../salles/places-de-seance';
import {
  BilanJourDto,
  SeanceGuichetDto,
  VenteEffectueeDto,
  VenteGuichetDto,
} from './dto/guichet.dto';

/** Le guichet peut encore vendre pendant les 15 premières minutes de la séance (publicités). */
export const MARGE_VENTE_MS = 15 * 60 * 1000;
/** Séances proposées au guichet : jusqu'à 7 jours à l'avance. */
export const HORIZON_VENTE_MS = 7 * 24 * 3600 * 1000;
export const TITULAIRE_GUICHET = 'Vente au guichet';
const INDEX_PLACE_OCCUPEE = 'uq_billet_place_occupee';
const TENTATIVES_REFERENCE = 3;
const OPTIONS_TRANSACTION = { maxWait: 5_000, timeout: 10_000 };

function erreurPrisma(e: unknown, code: string): e is Prisma.PrismaClientKnownRequestError {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === code;
}

function estViolationUnicite(e: unknown, cible: string): boolean {
  return erreurPrisma(e, 'P2002') && String(e.meta?.target ?? '').includes(cible);
}

/** Minuit à Paris pour la date donnée, quel que soit le fuseau du serveur. */
export function debutJourneeParis(date: Date): Date {
  const jour = date.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
  const decalage =
    new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', timeZoneName: 'shortOffset' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])?(\d{1,2})?(?::(\d{2}))?/.exec(decalage);
  const minutes = m?.[2] ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
  return new Date(Date.parse(`${jour}T00:00:00Z`) - minutes * 60_000);
}

@Injectable()
export class GuichetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codesQr: CodeQrService,
  ) {}

  /** Séances publiées que le guichet peut vendre, avec le nombre de places libres. */
  async seancesEnVente(): Promise<SeanceGuichetDto[]> {
    const maintenant = Date.now();
    const seances = await this.prisma.seance.findMany({
      where: {
        statut: 'PUBLIEE',
        film: { statut: 'PUBLIE' },
        debut: {
          gte: new Date(maintenant - MARGE_VENTE_MS),
          lte: new Date(maintenant + HORIZON_VENTE_MS),
        },
      },
      select: {
        id: true,
        debut: true,
        version: true,
        salleId: true,
        creeeLe: true,
        film: { select: { titre: true } },
        salle: { select: { nom: true } },
        _count: { select: { billets: { where: { statut: { not: 'ANNULE' } } } } },
      },
      orderBy: { debut: 'asc' },
    });
    // Capacité de chaque séance selon la configuration de salle qui lui est propre (US-7.2)
    return Promise.all(
      seances.map(async (s) => {
        const capacite = await this.prisma.place.count({
          where: placesDeLaSeance(s.salleId, s.creeeLe),
        });
        return {
          id: s.id,
          debut: s.debut,
          film: s.film.titre,
          salle: s.salle.nom,
          version: s.version,
          capacite,
          placesLibres: Math.max(0, capacite - s._count.billets),
        };
      }),
    );
  }

  /**
   * Vente au guichet (US-7.3) : même moteur et même contrainte d'unicité que la réservation en
   * ligne, donc une place vendue au guichet est aussitôt indisponible sur le site, et inversement.
   */
  async vendre(
    caissierId: number,
    seanceId: number,
    dto: VenteGuichetDto,
  ): Promise<VenteEffectueeDto> {
    const placeIds = dto.places.map((p) => p.placeId);
    if (new Set(placeIds).size !== placeIds.length) {
      throw new BadRequestException('Une même place est demandée deux fois.');
    }
    for (let essai = 1; ; essai++) {
      try {
        return await this.enregistrerVente(caissierId, seanceId, dto, placeIds);
      } catch (e) {
        if (estViolationUnicite(e, INDEX_PLACE_OCCUPEE) || erreurPrisma(e, 'P2034')) {
          throw new ConflictException(
            "Une des places vient d'être réservée en ligne ou à un autre guichet.",
          );
        }
        if (estViolationUnicite(e, 'reference') && essai < TENTATIVES_REFERENCE) continue;
        throw e;
      }
    }
  }

  /** Billets vendus aujourd'hui (heure de Paris), par canal de vente. */
  async bilanDuJour(maintenant = new Date()): Promise<BilanJourDto> {
    const debut = debutJourneeParis(maintenant);
    const billets = await this.prisma.billet.findMany({
      where: {
        statut: { not: 'ANNULE' },
        reservation: { statut: 'CONFIRMEE', creeeLe: { gte: debut } },
      },
      select: { prixApplique: true, reservation: { select: { canal: true } } },
    });
    const canaux = (['WEB', 'GUICHET'] as const).map((canal) => {
      const duCanal = billets.filter((b) => b.reservation.canal === canal);
      const montant = duCanal.reduce((somme, b) => somme + Number(b.prixApplique), 0);
      return { canal, billets: duCanal.length, montant: Math.round(montant * 100) / 100 };
    });
    return { jour: maintenant.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' }), canaux };
  }

  private async enregistrerVente(
    caissierId: number,
    seanceId: number,
    dto: VenteGuichetDto,
    placeIds: number[],
  ): Promise<VenteEffectueeDto> {
    const { reservation, seance, places, tarifs, total } = await this.prisma.$transaction(
      async (tx) => {
        const maintenant = new Date();
        const seance = await tx.seance.findUnique({
          where: { id: seanceId },
          select: {
            statut: true,
            debut: true,
            salleId: true,
            creeeLe: true,
            version: true,
            film: { select: { titre: true, statut: true } },
            salle: { select: { nom: true } },
          },
        });
        const vendable =
          seance !== null &&
          seance.statut === 'PUBLIEE' &&
          seance.film.statut === 'PUBLIE' &&
          seance.debut.getTime() > maintenant.getTime() - MARGE_VENTE_MS;
        if (seance === null || !vendable) {
          throw new UnprocessableEntityException('Cette séance ne peut plus être vendue.');
        }

        const places = await tx.place.findMany({
          where: { id: { in: placeIds }, ...placesDeLaSeance(seance.salleId, seance.creeeLe) },
          select: { id: true, rangee: true, numero: true, type: true },
        });
        if (places.length !== placeIds.length) {
          throw new UnprocessableEntityException(
            'Une ou plusieurs places ne correspondent pas à la salle de la séance.',
          );
        }
        const tarifIds = [...new Set(dto.places.map((p) => p.tarifId))];
        const tarifs = await tx.tarif.findMany({ where: { id: { in: tarifIds }, actif: true } });
        if (tarifs.length !== tarifIds.length) {
          throw new UnprocessableEntityException('Tarif inconnu ou inactif.');
        }
        const tarifParId = new Map(tarifs.map((t) => [t.id, t]));
        const total =
          Math.round(
            dto.places.reduce((s, p) => s + Number(tarifParId.get(p.tarifId)!.prix), 0) * 100,
          ) / 100;

        const reference = randomBytes(6).toString('hex').toUpperCase();
        const reservation = await tx.reservation.create({
          data: {
            reference,
            utilisateurId: caissierId,
            seanceId,
            canal: 'GUICHET',
            statut: 'CONFIRMEE',
            billets: {
              create: dto.places.map((p) => ({
                seanceId,
                placeId: p.placeId,
                tarifId: p.tarifId,
                prixApplique: tarifParId.get(p.tarifId)!.prix,
              })),
            },
          },
          include: { billets: true },
        });
        // Même QR code signé que les billets vendus en ligne : il se contrôle de la même façon.
        for (const billet of reservation.billets) {
          billet.codeQr = this.codesQr.signer(billet.id, seanceId);
          await tx.billet.update({ where: { id: billet.id }, data: { codeQr: billet.codeQr } });
        }
        await tx.paiement.create({
          data: {
            reservationId: reservation.id,
            refTransactionPsp: `GUICHET-${dto.modePaiement}-${reservation.reference}`,
            montant: total,
            statut: 'ACCEPTE',
            payeLe: maintenant,
          },
        });
        return { reservation, seance, places, tarifs: tarifParId, total };
      },
      OPTIONS_TRANSACTION,
    );

    const placeParId = new Map(places.map((p) => [p.id, p]));
    const billets = await Promise.all(
      reservation.billets.map(async (b) => {
        const place = placeParId.get(b.placeId)!;
        const tarif = tarifs.get(b.tarifId)!;
        return {
          id: b.id,
          film: seance.film.titre,
          debut: seance.debut,
          salle: seance.salle.nom,
          version: seance.version,
          place: `${place.rangee}${place.numero}`,
          pmr: place.type === 'PMR',
          tarif: tarif.libelle,
          justificatifRequis: tarif.justificatifRequis,
          prix: Number(b.prixApplique),
          titulaire: TITULAIRE_GUICHET,
          statut: b.statut,
          scanneLe: b.scanneLe,
          codeQr: b.codeQr as string,
          qrSvg: await qrEnSvg(b.codeQr as string, {
            type: 'svg',
            errorCorrectionLevel: 'M',
            margin: 2,
          }),
        };
      }),
    );
    return { reference: reservation.reference, total, modePaiement: dto.modePaiement, billets };
  }
}
