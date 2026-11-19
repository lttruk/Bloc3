import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { disponibilite, FilmsService, HORIZON_FICHE_MS } from './films.service';

describe('disponibilite', () => {
  it('indique « complet » quand plus aucune place n’est libre', () => {
    expect(disponibilite(0, 120)).toBe('COMPLET');
  });

  it('indique « dernières places » sous 5 places ou 10 % de la salle', () => {
    expect(disponibilite(5, 40)).toBe('DERNIERES_PLACES');
    expect(disponibilite(12, 120)).toBe('DERNIERES_PLACES');
    expect(disponibilite(13, 120)).toBe('DISPONIBLE');
  });

  it('indique « disponible » au-delà du seuil', () => {
    expect(disponibilite(30, 40)).toBe('DISPONIBLE');
  });
});

describe('FilmsService', () => {
  const MAINTENANT = new Date('2027-03-27T10:00:00Z');
  const CREEE_LE = new Date('2027-01-01T00:00:00Z');
  let prisma: any;
  let service: FilmsService;

  const film = {
    id: 3,
    titre: 'Hors Ligne',
    synopsis: 'Une panne mondiale…',
    dureeMinutes: 112,
    genre: 'Thriller',
    classification: 'Tous publics',
    bandeAnnonceUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
  };
  const seance = (id: number, salleId: number) => ({
    id,
    debut: new Date('2027-03-28T18:00:00Z'),
    fin: new Date('2027-03-28T20:07:00Z'),
    version: 'VF',
    festival: false,
    ouvertureVente: null,
    salleId,
    creeeLe: CREEE_LE,
    salle: { id: salleId, nom: `Salle ${salleId}` },
  });

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(MAINTENANT);
    prisma = {
      film: { findFirst: jest.fn().mockResolvedValue(film) },
      seance: { findMany: jest.fn().mockResolvedValue([]) },
      tarif: { findMany: jest.fn().mockResolvedValue([]) },
      billet: { groupBy: jest.fn().mockResolvedValue([]) },
      place: { count: jest.fn() },
    };
    service = new FilmsService(prisma as PrismaService);
  });

  afterEach(() => jest.useRealTimers());

  it('refuse un film inexistant ou non publié (404)', async () => {
    prisma.film.findFirst.mockResolvedValue(null);
    await expect(service.fiche(99)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.film.findFirst.mock.calls[0][0].where).toEqual({ id: 99, statut: 'PUBLIE' });
  });

  it('ne retient que les séances publiées des 30 prochains jours, par horaire', async () => {
    await service.fiche(3);
    const { where, orderBy } = prisma.seance.findMany.mock.calls[0][0];
    expect(where).toEqual({
      filmId: 3,
      statut: 'PUBLIEE',
      debut: { gt: MAINTENANT, lte: new Date(MAINTENANT.getTime() + HORIZON_FICHE_MS) },
    });
    expect(orderBy).toEqual({ debut: 'asc' });
  });

  it('calcule les places libres et le statut de chaque séance', async () => {
    prisma.seance.findMany.mockResolvedValue([seance(10, 1), seance(11, 1), seance(12, 2)]);
    prisma.place.count.mockImplementation(({ where }: any) =>
      Promise.resolve(where.salleId === 1 ? 100 : 40),
    );
    prisma.billet.groupBy.mockResolvedValue([
      { seanceId: 10, _count: { _all: 20 } },
      { seanceId: 11, _count: { _all: 95 } },
      { seanceId: 12, _count: { _all: 40 } },
    ]);
    prisma.tarif.findMany.mockResolvedValue([
      { id: 1, libelle: 'Plein', prix: '11.50', justificatifRequis: false },
    ]);

    const fiche = await service.fiche(3);

    expect(fiche.bandeAnnonceUrl).toBe(film.bandeAnnonceUrl);
    expect(fiche.tarifs).toEqual([
      { id: 1, libelle: 'Plein', prix: 11.5, justificatifRequis: false },
    ]);
    expect(fiche.seances.map((s) => [s.id, s.placesLibres, s.disponibilite])).toEqual([
      [10, 80, 'DISPONIBLE'],
      [11, 5, 'DERNIERES_PLACES'],
      [12, 0, 'COMPLET'],
    ]);
    expect(fiche.seances[0]).not.toHaveProperty('creeeLe');
    // Une seule requête par configuration de salle, pas une par séance
    expect(prisma.place.count).toHaveBeenCalledTimes(2);
    expect(prisma.billet.groupBy.mock.calls[0][0].where).toEqual({
      seanceId: { in: [10, 11, 12] },
      statut: { not: 'ANNULE' },
    });
  });
});
