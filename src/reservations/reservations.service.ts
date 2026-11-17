import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreerReservationDto } from './dto/creer-reservation.dto';

export const DUREE_VERROU_MS = 10 * 60 * 1000;
const INDEX_PLACE_OCCUPEE = 'uq_billet_place_occupee';
const TENTATIVES_REFERENCE = 3;
const OPTIONS_TRANSACTION = { maxWait: 5_000, timeout: 10_000 };

function erreurPrisma(e: unknown, code: string): e is Prisma.PrismaClientKnownRequestError {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === code;
}

function estViolationUnicite(e: unknown, cible: string): boolean {
  return erreurPrisma(e, 'P2002') && String(e.meta?.target ?? '').includes(cible);
}

@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  async verrouillerPlaces(utilisateurId: number, seanceId: number, dto: CreerReservationDto) {
    const placeIds = dto.places.map((p) => p.placeId);
    if (new Set(placeIds).size !== placeIds.length) {
      throw new BadRequestException('Une même place est demandée deux fois.');
    }
    for (let essai = 1; ; essai++) {
      try {
        return await this.creerReservationEnAttente(utilisateurId, seanceId, dto, placeIds);
      } catch (e) {
        // P2034 : conflit d'écriture ou interblocage entre transactions concurrentes
        if (estViolationUnicite(e, INDEX_PLACE_OCCUPEE) || erreurPrisma(e, 'P2034')) {
          throw new ConflictException(
            "Une des places vient d'être prise. Merci d'en choisir une autre.",
          );
        }
        // Collision (très rare) sur la référence aléatoire : on régénère.
        if (estViolationUnicite(e, 'reference') && essai < TENTATIVES_REFERENCE) continue;
        throw e;
      }
    }
  }

  private creerReservationEnAttente(
    utilisateurId: number,
    seanceId: number,
    dto: CreerReservationDto,
    placeIds: number[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      const maintenant = new Date();
      const seance = await tx.seance.findUnique({ where: { id: seanceId } });
      const reservable =
        seance !== null &&
        seance.statut === 'PUBLIEE' &&
        seance.debut > maintenant &&
        (seance.ouvertureVente === null || seance.ouvertureVente <= maintenant);
      if (seance === null || !reservable) {
        throw new UnprocessableEntityException('Cette séance ne peut pas être réservée.');
      }

      const places = await tx.place.findMany({
        where: { id: { in: placeIds }, salleId: seance.salleId, active: true },
        select: { id: true },
      });
      if (places.length !== placeIds.length) {
        throw new UnprocessableEntityException(
          'Une ou plusieurs places ne correspondent pas à la salle de la séance.',
        );
      }

      const tarifIds = [...new Set(dto.places.map((p) => p.tarifId))];
      const tarifs = await tx.tarif.findMany({
        where: { id: { in: tarifIds }, actif: true },
      });
      if (tarifs.length !== tarifIds.length) {
        throw new UnprocessableEntityException('Tarif inconnu ou inactif.');
      }
      const prixParTarif = new Map(tarifs.map((t) => [t.id, t.prix]));

      // L'index unique uq_billet_place_occupee est la barrière finale :
      // si un autre client a pris la place entre-temps, l'insertion échoue (P2002).
      return tx.reservation.create({
        data: {
          reference: randomBytes(6).toString('hex').toUpperCase(),
          utilisateurId,
          seanceId,
          canal: 'WEB',
          statut: 'EN_ATTENTE',
          expireLe: new Date(maintenant.getTime() + DUREE_VERROU_MS),
          billets: {
            create: dto.places.map((p) => ({
              seanceId,
              placeId: p.placeId,
              tarifId: p.tarifId,
              prixApplique: prixParTarif.get(p.tarifId)!,
            })),
          },
        },
        include: { billets: true },
      });
    }, OPTIONS_TRANSACTION);
  }
}
