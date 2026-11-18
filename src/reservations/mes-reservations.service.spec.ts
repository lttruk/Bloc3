import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MesReservationsService } from './mes-reservations.service';

describe('MesReservationsService', () => {
  const MAINTENANT = new Date('2027-03-27T10:00:00Z');
  let prisma: any;
  let tx: any;
  let service: MesReservationsService;

  const reservation = (statut: string, expireLe: Date | null) => ({
    reference: 'A1B2C3D4E5F6',
    statut,
    creeeLe: MAINTENANT,
    expireLe,
    seance: {
      id: 5,
      debut: new Date('2027-03-27T20:00:00Z'),
      version: 'VO',
      film: { titre: 'Hors Ligne' },
      salle: { nom: 'Salle 1' },
    },
    billets: [
      { prixApplique: new Prisma.Decimal('11.50'), place: { rangee: 'D', numero: 9 }, tarif: { libelle: 'Plein' } },
      { prixApplique: new Prisma.Decimal('9.00'), place: { rangee: 'D', numero: 10 }, tarif: { libelle: 'Réduit' } },
    ],
  });

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(MAINTENANT);
    tx = {
      reservation: { findFirst: jest.fn(), update: jest.fn() },
      billet: { updateMany: jest.fn() },
    };
    prisma = {
      reservation: { findMany: jest.fn() },
      $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
    };
    service = new MesReservationsService(prisma as PrismaService);
  });

  afterEach(() => jest.useRealTimers());

  describe('lister', () => {
    it('renvoie les réservations de l’utilisateur avec leurs places et leur total', async () => {
      prisma.reservation.findMany.mockResolvedValue([
        reservation('EN_ATTENTE', new Date('2027-03-27T10:05:00Z')),
      ]);

      const [r] = await service.lister(7);

      expect(prisma.reservation.findMany.mock.calls[0][0].where).toEqual({ utilisateurId: 7 });
      expect(r).toMatchObject({
        reference: 'A1B2C3D4E5F6',
        statut: 'EN_ATTENTE',
        film: 'Hors Ligne',
        salle: 'Salle 1',
        total: 20.5,
      });
      expect(r.billets).toEqual([
        { place: 'D9', tarif: 'Plein', prix: 11.5 },
        { place: 'D10', tarif: 'Réduit', prix: 9 },
      ]);
    });

    it('affiche comme expirée une réservation dont le verrou est dépassé', async () => {
      prisma.reservation.findMany.mockResolvedValue([
        reservation('EN_ATTENTE', new Date('2027-03-27T09:59:00Z')),
      ]);
      const [r] = await service.lister(7);
      expect(r.statut).toBe('EXPIREE');
    });
  });

  describe('liberer', () => {
    it('annule les billets et la réservation en attente', async () => {
      tx.reservation.findFirst.mockResolvedValue({ id: 3, statut: 'EN_ATTENTE' });

      await service.liberer(7, 'A1B2C3D4E5F6');

      expect(tx.reservation.findFirst.mock.calls[0][0].where).toEqual({
        reference: 'A1B2C3D4E5F6',
        utilisateurId: 7,
      });
      expect(tx.billet.updateMany).toHaveBeenCalledWith({
        where: { reservationId: 3 },
        data: { statut: 'ANNULE' },
      });
      expect(tx.reservation.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { statut: 'ANNULEE' },
      });
    });

    it('renvoie 404 si la réservation n’existe pas ou appartient à un autre utilisateur', async () => {
      tx.reservation.findFirst.mockResolvedValue(null);
      await expect(service.liberer(7, 'INCONNUE')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuse de libérer une réservation qui n’est plus en attente (409)', async () => {
      tx.reservation.findFirst.mockResolvedValue({ id: 3, statut: 'CONFIRMEE' });
      await expect(service.liberer(7, 'A1B2C3D4E5F6')).rejects.toBeInstanceOf(ConflictException);
      expect(tx.billet.updateMany).not.toHaveBeenCalled();
    });
  });
});
