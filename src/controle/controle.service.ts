import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CodeQrService } from '../billets/code-qr.service';
import { PrismaService } from '../prisma/prisma.service';
import { BilletControleDto, ResultatScanDto, ScanDto, SeanceControleDto } from './dto/controle.dto';

/** Séances proposées au contrôleur : commencées depuis moins de 3 h ou débutant dans les 12 h. */
const AVANT_MS = 3 * 3600 * 1000;
const APRES_MS = 12 * 3600 * 1000;

const SELECTION_BILLET = {
  id: true,
  seanceId: true,
  codeQr: true,
  statut: true,
  scanneLe: true,
  place: { select: { rangee: true, numero: true } },
  tarif: { select: { libelle: true, justificatifRequis: true } },
  seance: {
    select: { debut: true, film: { select: { titre: true } }, salle: { select: { nom: true } } },
  },
  reservation: {
    select: { statut: true, utilisateur: { select: { prenom: true, nom: true } } },
  },
} satisfies Prisma.BilletSelect;

type BilletLu = Prisma.BilletGetPayload<{ select: typeof SELECTION_BILLET }>;

const fmtHeure = (d: Date) =>
  d.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });

const fmtSeance = (d: Date) =>
  d.toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

function presenter(b: BilletLu, scanneLe: Date | null = b.scanneLe): BilletControleDto {
  return {
    film: b.seance.film.titre,
    debut: b.seance.debut,
    salle: b.seance.salle.nom,
    place: `${b.place.rangee}${b.place.numero}`,
    tarif: b.tarif.libelle,
    justificatif: b.tarif.justificatifRequis ? b.tarif.libelle : null,
    titulaire: `${b.reservation.utilisateur.prenom} ${b.reservation.utilisateur.nom}`,
    scanneLe,
  };
}

@Injectable()
export class ControleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codesQr: CodeQrService,
  ) {}

  /** Séances du moment, pour choisir la salle contrôlée. */
  async seancesDuMoment(): Promise<SeanceControleDto[]> {
    const maintenant = Date.now();
    const seances = await this.prisma.seance.findMany({
      where: {
        statut: 'PUBLIEE',
        debut: { gte: new Date(maintenant - AVANT_MS), lte: new Date(maintenant + APRES_MS) },
      },
      select: {
        id: true,
        debut: true,
        film: { select: { titre: true } },
        salle: { select: { nom: true } },
      },
      orderBy: { debut: 'asc' },
    });
    return seances.map((s) => ({
      id: s.id,
      debut: s.debut,
      film: s.film.titre,
      salle: s.salle.nom,
    }));
  }

  /** Contrôle d'un billet à l'entrée (US-6.1) : écran vert si valide, rouge avec le motif sinon. */
  async scanner(dto: ScanDto): Promise<ResultatScanDto> {
    const code = dto.code.trim();
    const contenu = this.codesQr.lire(code);
    const falsifie: ResultatScanDto = {
      valide: false,
      motif: 'FALSIFIE',
      message: 'QR code invalide ou falsifié',
    };
    if (!contenu) return falsifie;

    const billet = await this.prisma.billet.findUnique({
      where: { id: contenu.billetId },
      select: SELECTION_BILLET,
    });
    // Signature correcte mais billet inconnu ou code différent de celui émis : refus.
    if (!billet || billet.codeQr !== code || billet.seanceId !== contenu.seanceId) return falsifie;

    if (billet.statut === 'ANNULE' || billet.reservation.statut === 'ANNULEE') {
      return {
        valide: false,
        motif: 'ANNULE',
        message: 'Billet annulé',
        billet: presenter(billet),
      };
    }
    if (dto.seanceId && billet.seanceId !== dto.seanceId) {
      return {
        valide: false,
        motif: 'AUTRE_SEANCE',
        message: `Billet pour une autre séance : ${billet.seance.film.titre}, ${fmtSeance(billet.seance.debut)}, ${billet.seance.salle.nom}`,
        billet: presenter(billet),
      };
    }

    // Passage ACTIF → UTILISE en une seule requête : deux scans simultanés ne valident qu'une entrée.
    const scanneLe = new Date();
    const { count } = await this.prisma.billet.updateMany({
      where: { id: billet.id, statut: 'ACTIF' },
      data: { statut: 'UTILISE', scanneLe },
    });
    if (count === 0) {
      const relu = await this.prisma.billet.findUniqueOrThrow({
        where: { id: billet.id },
        select: SELECTION_BILLET,
      });
      const heure = relu.scanneLe ? ` à ${fmtHeure(relu.scanneLe)}` : '';
      return {
        valide: false,
        motif: 'DEJA_UTILISE',
        message: `Billet déjà utilisé${heure}`,
        billet: presenter(relu),
      };
    }
    return { valide: true, message: 'Billet valide', billet: presenter(billet, scanneLe) };
  }
}
