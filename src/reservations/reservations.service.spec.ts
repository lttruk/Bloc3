import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationsService } from './reservations.service';

function erreurPrisma(code: string, target?: string) {
  return new Prisma.PrismaClientKnownRequestError('Erreur simulée', {
    code,
    clientVersion: 'test',
    meta: target ? { target } : undefined,
  });
}

describe('ReservationsService.verrouillerPlaces', () => {
  const MAINTENANT = new Date('2027-03-27T10:00:00Z');
  const demande = { places: [{ placeId: 42, tarifId: 1 }] };
  let tx: any;
  let prisma: any;
  let service: ReservationsService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(MAINTENANT);
    tx = {
      seance: {
        findUnique: jest.fn().mockResolvedValue({
          id: 5,
          salleId: 3,
          statut: 'PUBLIEE',
          ouvertureVente: null,
          debut: new Date('2027-03-27T20:00:00Z'),
        }),
      },
      place: { findMany: jest.fn().mockResolvedValue([{ id: 42 }]) },
      tarif: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, prix: new Prisma.Decimal('9.50') }]),
      },
      reservation: {
        create: jest.fn().mockResolvedValue({ reference: 'A1B2C3D4E5F6', billets: [{}] }),
      },
    };
    prisma = { $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)) };
    service = new ReservationsService(prisma as PrismaService);
  });

  afterEach(() => jest.useRealTimers());

  it('crée une réservation en attente qui expire 10 minutes plus tard', async () => {
    await service.verrouillerPlaces(7, 5, demande);
    const { data } = tx.reservation.create.mock.calls[0][0];
    expect(data.statut).toBe('EN_ATTENTE');
    expect(data.canal).toBe('WEB');
    expect(data.expireLe).toEqual(new Date('2027-03-27T10:10:00Z'));
    expect(data.billets.create).toEqual([
      { seanceId: 5, placeId: 42, tarifId: 1, prixApplique: new Prisma.Decimal('9.50') },
    ]);
  });

  it('refuse une même place demandée deux fois', async () => {
    const doublon = { places: [{ placeId: 42, tarifId: 1 }, { placeId: 42, tarifId: 2 }] };
    await expect(service.verrouillerPlaces(7, 5, doublon)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuse une séance qui n'est pas publiée", async () => {
    tx.seance.findUnique.mockResolvedValue({ statut: 'ANNULEE' });
    await expect(service.verrouillerPlaces(7, 5, demande)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(tx.reservation.create).not.toHaveBeenCalled();
  });

  it('refuse une séance inexistante', async () => {
    tx.seance.findUnique.mockResolvedValue(null);
    await expect(service.verrouillerPlaces(7, 5, demande)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it("refuse une séance dont la vente n'est pas encore ouverte", async () => {
    tx.seance.findUnique.mockResolvedValue({
      salleId: 3,
      statut: 'PUBLIEE',
      debut: new Date('2027-03-27T20:00:00Z'),
      ouvertureVente: new Date('2027-03-27T12:00:00Z'),
    });
    await expect(service.verrouillerPlaces(7, 5, demande)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it("refuse une place qui n'appartient pas à la salle de la séance", async () => {
    tx.place.findMany.mockResolvedValue([]);
    await expect(service.verrouillerPlaces(7, 5, demande)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('refuse un tarif inactif', async () => {
    tx.tarif.findMany.mockResolvedValue([]);
    await expect(service.verrouillerPlaces(7, 5, demande)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it("transforme le conflit d'unicité sur la place en erreur 409", async () => {
    tx.reservation.create.mockRejectedValue(erreurPrisma('P2002', 'uq_billet_place_occupee'));
    await expect(service.verrouillerPlaces(7, 5, demande)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('transforme un interblocage entre transactions en erreur 409', async () => {
    tx.reservation.create.mockRejectedValue(erreurPrisma('P2034'));
    await expect(service.verrouillerPlaces(7, 5, demande)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('régénère la référence en cas de collision', async () => {
    tx.reservation.create
      .mockRejectedValueOnce(erreurPrisma('P2002', 'reference'))
      .mockResolvedValueOnce({ reference: 'B2C3D4E5F6A1', billets: [{}] });
    const r = await service.verrouillerPlaces(7, 5, demande);
    expect(r.reference).toBe('B2C3D4E5F6A1');
    expect(tx.reservation.create).toHaveBeenCalledTimes(2);
  });

  it('propage une erreur inattendue', async () => {
    tx.reservation.create.mockRejectedValue(new Error('base indisponible'));
    await expect(service.verrouillerPlaces(7, 5, demande)).rejects.toThrow('base indisponible');
  });
});
