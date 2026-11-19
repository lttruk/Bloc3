import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PERIODE_PAR_DEFAUT_MS, SeancesService } from './seances.service';

describe('SeancesService', () => {
  const MAINTENANT = new Date('2027-03-27T10:00:00Z');
  let prisma: any;
  let service: SeancesService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(MAINTENANT);
    prisma = {
      seance: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      place: { findMany: jest.fn() },
      billet: { findMany: jest.fn() },
      tarif: { findMany: jest.fn() },
    };
    service = new SeancesService(prisma as PrismaService);
  });

  afterEach(() => jest.useRealTimers());

  describe('lister', () => {
    it('ne renvoie par défaut que les séances publiées des 7 prochains jours', async () => {
      await service.lister({});
      const { where, orderBy } = prisma.seance.findMany.mock.calls[0][0];
      expect(where.statut).toBe('PUBLIEE');
      expect(where.film).toEqual({ statut: 'PUBLIE' });
      expect(where.debut.gt).toEqual(MAINTENANT);
      expect(where.debut.lte).toEqual(new Date(MAINTENANT.getTime() + PERIODE_PAR_DEFAUT_MS));
      expect(orderBy).toEqual({ debut: 'asc' });
    });

    it('applique les filtres de période, de film et de version', async () => {
      await service.lister({
        du: '2027-03-28T00:00:00Z',
        au: '2027-03-29T00:00:00Z',
        filmId: 4,
        version: 'VO',
      });
      const { where } = prisma.seance.findMany.mock.calls[0][0];
      expect(where.debut).toEqual({
        gt: new Date('2027-03-28T00:00:00Z'),
        lte: new Date('2027-03-29T00:00:00Z'),
      });
      expect(where.filmId).toBe(4);
      expect(where.version).toBe('VO');
    });

    it('ne remonte jamais avant l’instant présent', async () => {
      await service.lister({ du: '2020-01-01T00:00:00Z' });
      expect(prisma.seance.findMany.mock.calls[0][0].where.debut.gt).toEqual(MAINTENANT);
    });

    it('refuse une période dont la fin précède le début', async () => {
      await expect(
        service.lister({ du: '2027-03-29T00:00:00Z', au: '2027-03-28T00:00:00Z' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('planDeSalle', () => {
    const creeeLe = new Date('2027-03-01T10:00:00Z');
    const seance = { id: 5, salleId: 3, creeeLe, titre: 'Hors Ligne' };

    it('indique pour chaque place si elle est libre, en cours de réservation ou occupée', async () => {
      prisma.seance.findFirst.mockResolvedValue(seance);
      prisma.place.findMany.mockResolvedValue([
        { id: 1, rangee: 'A', numero: 1, type: 'PMR' },
        { id: 2, rangee: 'A', numero: 2, type: 'STANDARD' },
        { id: 3, rangee: 'A', numero: 3, type: 'STANDARD' },
      ]);
      prisma.billet.findMany.mockResolvedValue([
        { placeId: 2, reservation: { statut: 'EN_ATTENTE' } },
        { placeId: 3, reservation: { statut: 'CONFIRMEE' } },
      ]);
      prisma.tarif.findMany.mockResolvedValue([
        { id: 1, libelle: 'Plein', prix: new Prisma.Decimal('11.50'), justificatifRequis: false },
      ]);

      const plan = await service.planDeSalle(5);

      expect(prisma.place.findMany.mock.calls[0][0].where).toEqual({
        salleId: 3,
        ajouteeLe: { lte: creeeLe },
        OR: [{ retireeLe: null }, { retireeLe: { gt: creeeLe } }],
      });
      expect(prisma.billet.findMany.mock.calls[0][0].where).toEqual({
        seanceId: 5,
        statut: { not: 'ANNULE' },
      });
      expect(plan.places.map((p) => p.statut)).toEqual(['LIBRE', 'EN_COURS', 'OCCUPEE']);
      expect(plan.tarifs).toEqual([
        { id: 1, libelle: 'Plein', prix: 11.5, justificatifRequis: false },
      ]);
      expect(plan.seance).toEqual({ id: 5, titre: 'Hors Ligne' });
    });

    it('renvoie 404 pour une séance inexistante ou non publiée', async () => {
      prisma.seance.findFirst.mockResolvedValue(null);
      await expect(service.planDeSalle(99)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
