import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FiltresSeancesDto, PlanSalleDto, SeanceDto, StatutPlace } from './dto/seances.dto';

export const PERIODE_PAR_DEFAUT_MS = 7 * 24 * 3600 * 1000;
const MAX_SEANCES = 200;

const SELECTION_SEANCE = {
  id: true,
  debut: true,
  fin: true,
  version: true,
  festival: true,
  film: {
    select: {
      id: true,
      titre: true,
      genre: true,
      dureeMinutes: true,
      classification: true,
      synopsis: true,
    },
  },
  salle: { select: { id: true, nom: true } },
} satisfies Prisma.SeanceSelect;

@Injectable()
export class SeancesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Séances publiées et à venir d'un film publié, triées par horaire (US-1.1). */
  async lister(filtres: FiltresSeancesDto): Promise<SeanceDto[]> {
    const maintenant = new Date();
    const demande = filtres.du ? new Date(filtres.du) : maintenant;
    const du = demande > maintenant ? demande : maintenant;
    const au = filtres.au ? new Date(filtres.au) : new Date(du.getTime() + PERIODE_PAR_DEFAUT_MS);
    if (au <= du) throw new BadRequestException('La fin de période doit suivre son début.');

    return this.prisma.seance.findMany({
      where: {
        statut: 'PUBLIEE',
        debut: { gt: du, lte: au },
        film: { statut: 'PUBLIE' },
        ...(filtres.filmId ? { filmId: filtres.filmId } : {}),
        ...(filtres.version ? { version: filtres.version } : {}),
      },
      select: SELECTION_SEANCE,
      orderBy: { debut: 'asc' },
      take: MAX_SEANCES,
    });
  }

  /** Plan de salle d'une séance : état de chaque place et tarifs applicables (US-3.1). */
  async planDeSalle(seanceId: number): Promise<PlanSalleDto> {
    const seance = await this.prisma.seance.findFirst({
      where: { id: seanceId, statut: 'PUBLIEE', film: { statut: 'PUBLIE' } },
      select: { ...SELECTION_SEANCE, salleId: true },
    });
    if (!seance) throw new NotFoundException('Séance introuvable.');
    const { salleId, ...infosSeance } = seance;

    const [places, billets, tarifs] = await Promise.all([
      this.prisma.place.findMany({
        where: { salleId, active: true },
        select: { id: true, rangee: true, numero: true, type: true },
        orderBy: [{ rangee: 'asc' }, { numero: 'asc' }],
      }),
      this.prisma.billet.findMany({
        where: { seanceId, statut: { not: 'ANNULE' } },
        select: { placeId: true, reservation: { select: { statut: true } } },
      }),
      this.prisma.tarif.findMany({
        where: { actif: true },
        select: { id: true, libelle: true, prix: true, justificatifRequis: true },
        orderBy: { prix: 'desc' },
      }),
    ]);

    const etatParPlace = new Map<number, StatutPlace>(
      billets.map((b) => [
        b.placeId,
        b.reservation.statut === 'EN_ATTENTE' ? 'EN_COURS' : 'OCCUPEE',
      ]),
    );

    return {
      seance: infosSeance,
      places: places.map((p) => ({ ...p, statut: etatParPlace.get(p.id) ?? 'LIBRE' })),
      tarifs: tarifs.map((t) => ({ ...t, prix: Number(t.prix) })),
    };
  }
}
