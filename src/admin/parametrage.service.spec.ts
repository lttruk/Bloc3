import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ParametrageService } from './parametrage.service';

const MAINTENANT = new Date('2027-01-15T10:00:00Z');

function doublon() {
  return new Prisma.PrismaClientKnownRequestError('Doublon', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

const tarifLu = (surcharges: Record<string, unknown> = {}) => ({
  id: 4,
  libelle: 'Étudiant',
  prix: new Prisma.Decimal('8.50'),
  justificatifRequis: true,
  actif: true,
  _count: { billets: 12 },
  ...surcharges,
});

describe('ParametrageService', () => {
  let prisma: any;
  let service: ParametrageService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(MAINTENANT);
    prisma = {
      tarif: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      salle: {
        findUnique: jest.fn().mockResolvedValue({ id: 2, nom: 'Salle 2', capacite: 4 }),
        update: jest.fn(),
      },
      place: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
        createMany: jest.fn(),
      },
      seance: { count: jest.fn().mockResolvedValue(3) },
      journalAdmin: { create: jest.fn() },
    };
    prisma.$transaction = jest.fn((travail: (tx: unknown) => unknown) => travail(prisma));
    service = new ParametrageService(prisma as PrismaService);
  });

  afterEach(() => jest.useRealTimers());

  describe('tarifs', () => {
    it('liste les tarifs avec le nombre de billets vendus', async () => {
      prisma.tarif.findMany.mockResolvedValue([tarifLu()]);
      expect(await service.listerTarifs()).toEqual([
        {
          id: 4,
          libelle: 'Étudiant',
          prix: 8.5,
          justificatifRequis: true,
          actif: true,
          billetsVendus: 12,
        },
      ]);
    });

    it('crée un tarif actif et journalise', async () => {
      prisma.tarif.create.mockResolvedValue(tarifLu({ _count: { billets: 0 } }));
      await service.creerTarif(1, { libelle: 'Étudiant', prix: 8.5, justificatifRequis: true });
      expect(prisma.tarif.create.mock.calls[0][0].data).toEqual({
        libelle: 'Étudiant',
        prix: 8.5,
        justificatifRequis: true,
      });
      expect(prisma.journalAdmin.create.mock.calls[0][0].data).toMatchObject({
        entite: 'TARIF',
        action: 'CREATION',
      });
    });

    it('refuse un libellé déjà utilisé', async () => {
      prisma.$transaction.mockRejectedValue(doublon());
      await expect(service.creerTarif(1, { libelle: 'Plein', prix: 11.5 })).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(service.modifierTarif(1, 4, { libelle: 'Plein' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('désactive un tarif sans toucher aux billets vendus', async () => {
      prisma.tarif.findUnique.mockResolvedValue({
        id: 4,
        libelle: 'Étudiant',
        prix: 8.5,
        actif: true,
      });
      prisma.tarif.update.mockResolvedValue(tarifLu({ actif: false }));
      const tarif = await service.modifierTarif(1, 4, { actif: false });
      expect(tarif.actif).toBe(false);
      expect(prisma.tarif.update.mock.calls[0][0]).toMatchObject({
        where: { id: 4 },
        data: { actif: false },
      });
      // Aucun billet n'est modifié : chaque billet garde le prix enregistré à la vente
      expect(prisma.billet).toBeUndefined();
    });

    it('renvoie 404 pour un tarif inconnu', async () => {
      prisma.tarif.findUnique.mockResolvedValue(null);
      await expect(service.modifierTarif(1, 99, { prix: 5 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('configuration des salles', () => {
    it('lit la configuration actuelle par rangée, avec les places PMR', async () => {
      prisma.place.findMany.mockResolvedValue([
        { rangee: 'A', numero: 1, type: 'PMR' },
        { rangee: 'A', numero: 2, type: 'STANDARD' },
        { rangee: 'B', numero: 1, type: 'STANDARD' },
      ]);
      const config = await service.lireConfiguration(2);
      expect(config.rangees).toEqual([
        { rangee: 'A', places: 2, pmr: [1] },
        { rangee: 'B', places: 1, pmr: [] },
      ]);
      expect(config.seancesAVenir).toBe(3);
      expect(prisma.place.findMany.mock.calls[0][0].where).toEqual({ salleId: 2, retireeLe: null });
    });

    it('date les places retirées, crée les nouvelles et recalcule la capacité', async () => {
      prisma.place.findMany
        .mockResolvedValueOnce([
          { id: 1, rangee: 'A', numero: 1, type: 'STANDARD', retireeLe: null },
          { id: 2, rangee: 'A', numero: 2, type: 'STANDARD', retireeLe: null },
          { id: 3, rangee: 'B', numero: 1, type: 'STANDARD', retireeLe: null },
          { id: 4, rangee: 'B', numero: 2, type: 'STANDARD', retireeLe: null },
        ])
        .mockResolvedValueOnce([]);
      await service.configurerSalle(1, 2, {
        rangees: [{ rangee: 'A', places: 3, pmr: [1] }],
      });
      // B1 et B2 sortent de la configuration : datées, jamais supprimées
      expect(prisma.place.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [3, 4] } },
        data: { retireeLe: MAINTENANT, active: false },
      });
      // A1 devient PMR, A3 est créée avec sa date d'ajout
      expect(prisma.place.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { type: 'PMR', retireeLe: null, active: true },
      });
      expect(prisma.place.createMany).toHaveBeenCalledWith({
        data: [{ salleId: 2, rangee: 'A', numero: 3, type: 'STANDARD', ajouteeLe: MAINTENANT }],
      });
      expect(prisma.salle.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { capacite: 3 } });
      expect(prisma.journalAdmin.create.mock.calls[0][0].data).toMatchObject({
        entite: 'SALLE',
        details: { capaciteAvant: 4, capaciteApres: 3, placesRetirees: 2, placesAjoutees: 1 },
      });
    });

    it('réactive une position retirée au lieu de la recréer', async () => {
      prisma.place.findMany
        .mockResolvedValueOnce([
          { id: 7, rangee: 'A', numero: 1, type: 'STANDARD', retireeLe: new Date('2026-12-01') },
        ])
        .mockResolvedValueOnce([]);
      await service.configurerSalle(1, 2, { rangees: [{ rangee: 'A', places: 1 }] });
      expect(prisma.place.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { type: 'STANDARD', retireeLe: null, active: true },
      });
      expect(prisma.place.createMany).not.toHaveBeenCalled();
    });

    it('refuse une rangée en double ou une place PMR hors rangée', async () => {
      await expect(
        service.configurerSalle(1, 2, {
          rangees: [
            { rangee: 'A', places: 2 },
            { rangee: 'A', places: 3 },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.configurerSalle(1, 2, { rangees: [{ rangee: 'A', places: 2, pmr: [5] }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('renvoie 404 pour une salle inconnue', async () => {
      prisma.salle.findUnique.mockResolvedValue(null);
      await expect(service.lireConfiguration(99)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
