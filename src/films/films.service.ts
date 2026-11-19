import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { placesDeLaSeance } from '../salles/places-de-seance';
import { Disponibilite, FicheFilmDto } from './dto/films.dto';

/** Séances affichées sur la fiche : les 30 prochains jours. */
export const HORIZON_FICHE_MS = 30 * 24 * 3600 * 1000;
const MAX_SEANCES_FICHE = 120;
/** En dessous de ce nombre de places libres (ou de 10 % de la salle), la séance affiche « dernières places ». */
export const SEUIL_DERNIERES_PLACES = 5;

export function disponibilite(placesLibres: number, capacite: number): Disponibilite {
  if (placesLibres <= 0) return 'COMPLET';
  const seuil = Math.max(SEUIL_DERNIERES_PLACES, Math.ceil(capacite * 0.1));
  return placesLibres <= seuil ? 'DERNIERES_PLACES' : 'DISPONIBLE';
}

type ConfigurationSeance = { salleId: number; creeeLe: Date };
const cleConfiguration = (s: ConfigurationSeance) => `${s.salleId}|${s.creeeLe.getTime()}`;

@Injectable()
export class FilmsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Fiche détaillée d'un film publié, avec ses séances à venir et leur disponibilité (US-1.2). */
  async fiche(id: number): Promise<FicheFilmDto> {
    const film = await this.prisma.film.findFirst({
      where: { id, statut: 'PUBLIE' },
      select: {
        id: true,
        titre: true,
        synopsis: true,
        dureeMinutes: true,
        genre: true,
        classification: true,
        bandeAnnonceUrl: true,
      },
    });
    if (!film) throw new NotFoundException('Film introuvable.');

    const maintenant = new Date();
    const [seances, tarifs] = await Promise.all([
      this.prisma.seance.findMany({
        where: {
          filmId: id,
          statut: 'PUBLIEE',
          debut: { gt: maintenant, lte: new Date(maintenant.getTime() + HORIZON_FICHE_MS) },
        },
        select: {
          id: true,
          debut: true,
          fin: true,
          version: true,
          festival: true,
          ouvertureVente: true,
          salleId: true,
          creeeLe: true,
          salle: { select: { id: true, nom: true } },
        },
        orderBy: { debut: 'asc' },
        take: MAX_SEANCES_FICHE,
      }),
      this.prisma.tarif.findMany({
        where: { actif: true },
        select: { id: true, libelle: true, prix: true, justificatifRequis: true },
        orderBy: { prix: 'desc' },
      }),
    ]);

    const [occupation, capacites] = await Promise.all([
      this.prisma.billet.groupBy({
        by: ['seanceId'],
        where: { seanceId: { in: seances.map((s) => s.id) }, statut: { not: 'ANNULE' } },
        _count: { _all: true },
      }),
      this.capacites(seances),
    ]);
    const occupees = new Map(occupation.map((o) => [o.seanceId, o._count._all]));

    return {
      ...film,
      tarifs: tarifs.map((t) => ({ ...t, prix: Number(t.prix) })),
      seances: seances.map(({ salleId, creeeLe, ...s }) => {
        const capacite = capacites.get(cleConfiguration({ salleId, creeeLe })) ?? 0;
        const placesLibres = Math.max(0, capacite - (occupees.get(s.id) ?? 0));
        return {
          ...s,
          capacite,
          placesLibres,
          disponibilite: disponibilite(placesLibres, capacite),
        };
      }),
    };
  }

  /** Capacité de chaque configuration de salle rencontrée (une requête par configuration distincte). */
  private async capacites(seances: ConfigurationSeance[]): Promise<Map<string, number>> {
    const configurations = new Map(seances.map((s) => [cleConfiguration(s), s]));
    const comptes = await Promise.all(
      [...configurations.values()].map((s) =>
        this.prisma.place.count({ where: placesDeLaSeance(s.salleId, s.creeeLe) }),
      ),
    );
    return new Map([...configurations.keys()].map((cle, i) => [cle, comptes[i]]));
  }
}
