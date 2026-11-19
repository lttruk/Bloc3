import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MaReservationDto } from './dto/mes-reservations.dto';

const LIMITE_HISTORIQUE = 50;

@Injectable()
export class MesReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Réservations de l'utilisateur, les plus récentes d'abord (US-5.2). */
  async lister(utilisateurId: number): Promise<MaReservationDto[]> {
    const maintenant = new Date();
    const reservations = await this.prisma.reservation.findMany({
      // Les ventes au guichet enregistrées par un caissier ne sont pas ses propres réservations.
      where: { utilisateurId, canal: 'WEB' },
      orderBy: { creeeLe: 'desc' },
      take: LIMITE_HISTORIQUE,
      select: {
        reference: true,
        statut: true,
        creeeLe: true,
        expireLe: true,
        seance: {
          select: {
            id: true,
            debut: true,
            version: true,
            film: { select: { titre: true } },
            salle: { select: { nom: true } },
          },
        },
        billets: {
          select: {
            prixApplique: true,
            place: { select: { rangee: true, numero: true } },
            tarif: { select: { libelle: true } },
          },
          orderBy: { placeId: 'asc' },
        },
      },
    });

    return reservations.map((r) => {
      // Un verrou dépassé est affiché comme expiré sans attendre la tâche de libération.
      const expiree = r.statut === 'EN_ATTENTE' && r.expireLe !== null && r.expireLe <= maintenant;
      const billets = r.billets.map((b) => ({
        place: `${b.place.rangee}${b.place.numero}`,
        tarif: b.tarif.libelle,
        prix: Number(b.prixApplique),
      }));
      return {
        reference: r.reference,
        statut: expiree ? 'EXPIREE' : r.statut,
        creeeLe: r.creeeLe,
        expireLe: r.expireLe,
        seanceId: r.seance.id,
        film: r.seance.film.titre,
        debut: r.seance.debut,
        salle: r.seance.salle.nom,
        version: r.seance.version,
        billets,
        total: billets.reduce((somme, b) => somme + b.prix, 0),
      };
    });
  }

  /** Libère les places d'une réservation en attente appartenant à l'utilisateur. */
  async liberer(utilisateurId: number, reference: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Une réservation d'un autre utilisateur est traitée comme inexistante (pas de fuite d'information).
      const reservation = await tx.reservation.findFirst({
        where: { reference, utilisateurId },
        select: { id: true, statut: true },
      });
      if (!reservation) throw new NotFoundException('Réservation introuvable.');
      if (reservation.statut !== 'EN_ATTENTE') {
        throw new ConflictException('Seule une réservation en attente peut être libérée.');
      }
      // Billet annulé => place_occupee passe à NULL => la place redevient libre
      await tx.billet.updateMany({
        where: { reservationId: reservation.id },
        data: { statut: 'ANNULE' },
      });
      await tx.reservation.update({ where: { id: reservation.id }, data: { statut: 'ANNULEE' } });
    });
  }
}
