import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CodeQrService } from '../billets/code-qr.service';
import { PrismaService } from '../prisma/prisma.service';
import { debutJourneeParis, GuichetService, TITULAIRE_GUICHET } from './guichet.service';

jest.mock('qrcode', () => ({ toString: jest.fn(async (texte: string) => `<svg>${texte}</svg>`) }));

const MAINTENANT = new Date('2027-01-15T18:00:00Z');

function erreurPrisma(code: string, target?: string) {
  return new Prisma.PrismaClientKnownRequestError('Erreur simulée', {
    code,
    clientVersion: 'test',
    meta: target ? { target } : undefined,
  });
}

const seanceVendable = {
  statut: 'PUBLIEE',
  debut: new Date('2027-01-15T19:00:00Z'),
  salleId: 2,
  creeeLe: new Date('2027-01-01T10:00:00Z'),
  version: 'VF',
  film: { titre: 'Hors Ligne', statut: 'PUBLIE' },
  salle: { nom: 'Salle 2' },
};

describe('GuichetService', () => {
  let prisma: any;
  let service: GuichetService;
  const codesQr = { signer: jest.fn((b: number, s: number) => `QR-${b}-${s}`) };
  const dto = {
    places: [
      { placeId: 10, tarifId: 1 },
      { placeId: 11, tarifId: 2 },
    ],
    modePaiement: 'CARTE' as const,
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(MAINTENANT);
    prisma = {
      seance: { findUnique: jest.fn().mockResolvedValue(seanceVendable), findMany: jest.fn() },
      place: {
        count: jest.fn().mockResolvedValue(120),
        findMany: jest.fn().mockResolvedValue([
          { id: 10, rangee: 'C', numero: 4, type: 'STANDARD' },
          { id: 11, rangee: 'C', numero: 5, type: 'PMR' },
        ]),
      },
      tarif: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, libelle: 'Plein', prix: 11.5, justificatifRequis: false },
          { id: 2, libelle: 'Réduit', prix: 9, justificatifRequis: true },
        ]),
      },
      reservation: {
        create: jest.fn().mockResolvedValue({
          id: 50,
          reference: 'GUICHET00001',
          billets: [
            {
              id: 101,
              placeId: 10,
              tarifId: 1,
              prixApplique: 11.5,
              statut: 'ACTIF',
              scanneLe: null,
              codeQr: null,
            },
            {
              id: 102,
              placeId: 11,
              tarifId: 2,
              prixApplique: 9,
              statut: 'ACTIF',
              scanneLe: null,
              codeQr: null,
            },
          ],
        }),
      },
      billet: { update: jest.fn(), findMany: jest.fn() },
      paiement: { create: jest.fn() },
    };
    prisma.$transaction = jest.fn((travail: (tx: unknown) => unknown) => travail(prisma));
    service = new GuichetService(prisma as PrismaService, codesQr as unknown as CodeQrService);
  });

  afterEach(() => jest.useRealTimers());

  describe('vendre', () => {
    it('enregistre une vente confirmée, canal guichet, sans délai d’expiration', async () => {
      await service.vendre(8, 3, dto);
      const { data } = prisma.reservation.create.mock.calls[0][0];
      expect(data).toMatchObject({
        utilisateurId: 8,
        seanceId: 3,
        canal: 'GUICHET',
        statut: 'CONFIRMEE',
      });
      expect(data.expireLe).toBeUndefined();
      expect(data.billets.create).toEqual([
        { seanceId: 3, placeId: 10, tarifId: 1, prixApplique: 11.5 },
        { seanceId: 3, placeId: 11, tarifId: 2, prixApplique: 9 },
      ]);
    });

    it('émet le même QR code signé qu’en ligne et enregistre l’encaissement', async () => {
      const vente = await service.vendre(8, 3, dto);
      expect(prisma.billet.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: { codeQr: 'QR-101-3' },
      });
      expect(prisma.paiement.create.mock.calls[0][0].data).toMatchObject({
        reservationId: 50,
        refTransactionPsp: 'GUICHET-CARTE-GUICHET00001',
        montant: 20.5,
        statut: 'ACCEPTE',
      });
      expect(vente.total).toBe(20.5);
      expect(vente.billets[1]).toMatchObject({
        place: 'C5',
        pmr: true,
        tarif: 'Réduit',
        justificatifRequis: true,
        titulaire: TITULAIRE_GUICHET,
        codeQr: 'QR-102-3',
        qrSvg: '<svg>QR-102-3</svg>',
      });
    });

    it('refuse une place déjà vendue sur un autre canal (contrainte d’unicité)', async () => {
      prisma.$transaction.mockRejectedValue(erreurPrisma('P2002', 'uq_billet_place_occupee'));
      await expect(service.vendre(8, 3, dto)).rejects.toBeInstanceOf(ConflictException);
    });

    it('régénère la référence en cas de collision', async () => {
      prisma.$transaction
        .mockRejectedValueOnce(erreurPrisma('P2002', 'reference'))
        .mockImplementation((travail: (tx: unknown) => unknown) => travail(prisma));
      await expect(service.vendre(8, 3, dto)).resolves.toMatchObject({ reference: 'GUICHET00001' });
    });

    it('refuse une place demandée deux fois', async () => {
      await expect(
        service.vendre(8, 3, { ...dto, places: [dto.places[0], dto.places[0]] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('vend encore pendant les 15 premières minutes, plus après', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        ...seanceVendable,
        debut: new Date('2027-01-15T17:50:00Z'),
      });
      await expect(service.vendre(8, 3, dto)).resolves.toBeDefined();
      prisma.seance.findUnique.mockResolvedValue({
        ...seanceVendable,
        debut: new Date('2027-01-15T17:40:00Z'),
      });
      await expect(service.vendre(8, 3, dto)).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('refuse une séance non publiée, une place d’une autre salle ou un tarif inactif', async () => {
      prisma.seance.findUnique.mockResolvedValueOnce({ ...seanceVendable, statut: 'PROGRAMMEE' });
      await expect(service.vendre(8, 3, dto)).rejects.toBeInstanceOf(UnprocessableEntityException);
      prisma.place.findMany.mockResolvedValueOnce([
        { id: 10, rangee: 'C', numero: 4, type: 'STANDARD' },
      ]);
      await expect(service.vendre(8, 3, dto)).rejects.toBeInstanceOf(UnprocessableEntityException);
      prisma.tarif.findMany.mockResolvedValueOnce([{ id: 1, libelle: 'Plein', prix: 11.5 }]);
      await expect(service.vendre(8, 3, dto)).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  it('liste les séances en vente avec leurs places libres', async () => {
    prisma.seance.findMany.mockResolvedValue([
      {
        id: 3,
        debut: seanceVendable.debut,
        version: 'VO',
        film: { titre: 'Hors Ligne' },
        salleId: 2,
        creeeLe: new Date('2027-01-01T10:00:00Z'),
        salle: { nom: 'Salle 2' },
        _count: { billets: 20 },
      },
    ]);
    const [seance] = await service.seancesEnVente();
    expect(seance).toMatchObject({ id: 3, film: 'Hors Ligne', placesLibres: 100, capacite: 120 });
    expect(prisma.seance.findMany.mock.calls[0][0].where.statut).toBe('PUBLIEE');
  });

  it('fait le bilan du jour par canal', async () => {
    prisma.billet.findMany.mockResolvedValue([
      { prixApplique: 11.5, reservation: { canal: 'WEB' } },
      { prixApplique: 9, reservation: { canal: 'GUICHET' } },
      { prixApplique: 11.5, reservation: { canal: 'GUICHET' } },
    ]);
    const bilan = await service.bilanDuJour(MAINTENANT);
    expect(bilan).toEqual({
      jour: '2027-01-15',
      canaux: [
        { canal: 'WEB', billets: 1, montant: 11.5 },
        { canal: 'GUICHET', billets: 2, montant: 20.5 },
      ],
    });
  });

  it('calcule minuit à Paris en hiver et en été', () => {
    expect(debutJourneeParis(new Date('2027-01-15T18:00:00Z')).toISOString()).toBe(
      '2027-01-14T23:00:00.000Z',
    );
    expect(debutJourneeParis(new Date('2027-07-15T18:00:00Z')).toISOString()).toBe(
      '2027-07-14T22:00:00.000Z',
    );
    expect(debutJourneeParis(new Date('2027-01-15T23:30:00Z')).toISOString()).toBe(
      '2027-01-15T23:00:00.000Z',
    );
  });
});
