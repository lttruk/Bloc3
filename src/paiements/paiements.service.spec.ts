import { ConflictException, NotFoundException } from '@nestjs/common';
import { CodeQrService } from '../billets/code-qr.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaiementsService } from './paiements.service';
import { SessionStripe, StripeClient } from './stripe.client';

const MAINTENANT = new Date('2027-03-27T10:00:00Z');

const sessionPayee = (surcharges: Partial<SessionStripe> = {}): SessionStripe => ({
  id: 'cs_test_1',
  url: null,
  status: 'complete',
  payment_status: 'paid',
  amount_total: 2050,
  client_reference_id: 'REF123',
  ...surcharges,
});

const paiementEnBase = (surcharges: Record<string, unknown> = {}) => ({
  id: 9,
  montant: 20.5,
  reservation: {
    id: 5,
    reference: 'REF123',
    statut: 'EN_ATTENTE',
    billets: [
      { id: 11, seanceId: 3, statut: 'ACTIF' },
      { id: 12, seanceId: 3, statut: 'ACTIF' },
    ],
  },
  ...surcharges,
});

describe('PaiementsService', () => {
  let prisma: any;
  let stripe: {
    creerSessionCheckout: jest.Mock;
    lireSession: jest.Mock;
    verifierEvenement: jest.Mock;
  };
  let service: PaiementsService;
  const codesQr = { signer: jest.fn((b: number, s: number) => `QR-${b}-${s}`) };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(MAINTENANT);
    prisma = {
      reservation: { findFirst: jest.fn(), update: jest.fn() },
      paiement: {
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      billet: { update: jest.fn() },
    };
    prisma.$transaction = jest.fn((travail: (tx: unknown) => unknown) => travail(prisma));
    stripe = {
      creerSessionCheckout: jest.fn(),
      lireSession: jest.fn(),
      verifierEvenement: jest.fn(),
    };
    service = new PaiementsService(
      prisma as PrismaService,
      stripe as unknown as StripeClient,
      codesQr as unknown as CodeQrService,
    );
  });

  afterEach(() => jest.useRealTimers());

  describe('initier', () => {
    const reservation = {
      id: 5,
      reference: 'REF123',
      statut: 'EN_ATTENTE',
      expireLe: new Date('2027-03-27T10:05:00Z'),
      utilisateur: { email: 'spectateur@test.fr' },
      billets: [{ prixApplique: 11.5 }, { prixApplique: 9 }],
      seance: { debut: new Date('2027-03-28T19:00:00Z'), film: { titre: 'Hors Ligne' } },
    };

    it('ouvre une session Stripe du montant exact et enregistre le paiement initié', async () => {
      prisma.reservation.findFirst.mockResolvedValue(reservation);
      stripe.creerSessionCheckout.mockResolvedValue({
        id: 'cs_test_1',
        url: 'https://checkout.stripe.com/x',
      });
      const resultat = await service.initier(4, 'REF123', 'https://site');
      expect(resultat.url).toBe('https://checkout.stripe.com/x');
      const demande = stripe.creerSessionCheckout.mock.calls[0][0];
      expect(demande.montantCentimes).toBe(2050);
      expect(demande.urlSucces).toBe(
        'https://site/?paiement=succes&session_id={CHECKOUT_SESSION_ID}',
      );
      expect(demande.libelle).toContain('2 places');
      expect(prisma.paiement.create.mock.calls[0][0].data).toEqual({
        reservationId: 5,
        refTransactionPsp: 'cs_test_1',
        montant: 20.5,
        statut: 'INITIE',
      });
      // La réservation est cherchée au nom de l'utilisateur du jeton
      expect(prisma.reservation.findFirst.mock.calls[0][0].where).toEqual({
        reference: 'REF123',
        utilisateurId: 4,
      });
    });

    it('renvoie 404 pour la réservation d’un autre spectateur', async () => {
      prisma.reservation.findFirst.mockResolvedValue(null);
      await expect(service.initier(4, 'REF123', 'https://site')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuse une réservation expirée ou déjà payée', async () => {
      prisma.reservation.findFirst.mockResolvedValue({
        ...reservation,
        expireLe: new Date('2027-03-27T09:59:00Z'),
      });
      await expect(service.initier(4, 'REF123', 'https://site')).rejects.toBeInstanceOf(
        ConflictException,
      );
      prisma.reservation.findFirst.mockResolvedValue({ ...reservation, statut: 'CONFIRMEE' });
      await expect(service.initier(4, 'REF123', 'https://site')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(stripe.creerSessionCheckout).not.toHaveBeenCalled();
    });

    it('signale une session sans adresse de paiement', async () => {
      prisma.reservation.findFirst.mockResolvedValue(reservation);
      stripe.creerSessionCheckout.mockResolvedValue({ id: 'cs_test_1', url: null });
      await expect(service.initier(4, 'REF123', 'https://site')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('confirmer', () => {
    it('confirme la réservation et génère un QR code signé par billet', async () => {
      prisma.paiement.findUnique.mockResolvedValue(paiementEnBase());
      const resultat = await service.confirmer(sessionPayee());
      expect(resultat).toEqual({ reference: 'REF123', statut: 'CONFIRMEE', paye: true });
      expect(prisma.reservation.update.mock.calls[0][0].data).toEqual({
        statut: 'CONFIRMEE',
        expireLe: null,
      });
      expect(prisma.billet.update).toHaveBeenCalledWith({
        where: { id: 11 },
        data: { codeQr: 'QR-11-3' },
      });
      expect(prisma.billet.update).toHaveBeenCalledWith({
        where: { id: 12 },
        data: { codeQr: 'QR-12-3' },
      });
    });

    it('est idempotent : une notification rejouée ne regénère pas les billets', async () => {
      prisma.paiement.findUnique.mockResolvedValue(
        paiementEnBase({ reservation: { ...paiementEnBase().reservation, statut: 'CONFIRMEE' } }),
      );
      prisma.paiement.updateMany.mockResolvedValue({ count: 0 });
      const resultat = await service.confirmer(sessionPayee());
      expect(resultat).toEqual({ reference: 'REF123', statut: 'CONFIRMEE', paye: true });
      expect(prisma.reservation.update).not.toHaveBeenCalled();
      expect(prisma.billet.update).not.toHaveBeenCalled();
      expect(prisma.paiement.updateMany.mock.calls[0][0].where).toEqual({
        id: 9,
        statut: { not: 'ACCEPTE' },
      });
    });

    it('refuse un montant qui ne correspond pas à la réservation', async () => {
      prisma.paiement.findUnique.mockResolvedValue(paiementEnBase());
      await expect(service.confirmer(sessionPayee({ amount_total: 100 }))).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.paiement.updateMany).not.toHaveBeenCalled();
    });

    it('signale un remboursement si les places ont été libérées avant le paiement', async () => {
      prisma.paiement.findUnique.mockResolvedValue(
        paiementEnBase({
          reservation: {
            ...paiementEnBase().reservation,
            statut: 'EXPIREE',
            billets: [{ id: 11, seanceId: 3, statut: 'ANNULE' }],
          },
        }),
      );
      const resultat = await service.confirmer(sessionPayee());
      expect(resultat.aRembourser).toBe(true);
      expect(prisma.reservation.update).not.toHaveBeenCalled();
    });

    it('renvoie 404 pour une session inconnue', async () => {
      prisma.paiement.findUnique.mockResolvedValue(null);
      await expect(service.confirmer(sessionPayee())).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('verifierRetour', () => {
    beforeEach(() => {
      prisma.paiement.findUnique.mockResolvedValueOnce({
        reservation: { reference: 'REF123', statut: 'EN_ATTENTE', utilisateurId: 4 },
      });
    });

    it('relit la session chez Stripe et confirme si elle est payée', async () => {
      stripe.lireSession.mockResolvedValue(sessionPayee());
      prisma.paiement.findUnique.mockResolvedValueOnce(paiementEnBase());
      const resultat = await service.verifierRetour(4, 'cs_test_1');
      expect(stripe.lireSession).toHaveBeenCalledWith('cs_test_1');
      expect(resultat.statut).toBe('CONFIRMEE');
    });

    it('ne confirme rien si Stripe indique que la session n’est pas payée', async () => {
      stripe.lireSession.mockResolvedValue(sessionPayee({ payment_status: 'unpaid' }));
      const resultat = await service.verifierRetour(4, 'cs_test_1');
      expect(resultat).toEqual({ reference: 'REF123', statut: 'EN_ATTENTE', paye: false });
      expect(prisma.reservation.update).not.toHaveBeenCalled();
    });

    it('cache le paiement d’un autre spectateur', async () => {
      await expect(service.verifierRetour(99, 'cs_test_1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(stripe.lireSession).not.toHaveBeenCalled();
    });
  });

  describe('traiterNotification', () => {
    it('confirme sur checkout.session.completed payé', async () => {
      stripe.verifierEvenement.mockReturnValue({
        id: 'evt',
        type: 'checkout.session.completed',
        data: { object: sessionPayee() },
      });
      prisma.paiement.findUnique.mockResolvedValue(paiementEnBase());
      await service.traiterNotification(Buffer.from('{}'), 'sig');
      expect(prisma.reservation.update).toHaveBeenCalled();
    });

    it('marque le paiement refusé quand la session expire', async () => {
      stripe.verifierEvenement.mockReturnValue({
        id: 'evt',
        type: 'checkout.session.expired',
        data: { object: sessionPayee({ payment_status: 'unpaid' }) },
      });
      await service.traiterNotification(Buffer.from('{}'), 'sig');
      expect(prisma.paiement.updateMany).toHaveBeenCalledWith({
        where: { refTransactionPsp: 'cs_test_1', statut: 'INITIE' },
        data: { statut: 'REFUSE' },
      });
    });

    it('ignore les autres événements', async () => {
      stripe.verifierEvenement.mockReturnValue({
        id: 'evt',
        type: 'payment_intent.created',
        data: { object: sessionPayee() },
      });
      await service.traiterNotification(Buffer.from('{}'), 'sig');
      expect(prisma.paiement.updateMany).not.toHaveBeenCalled();
      expect(prisma.paiement.findUnique).not.toHaveBeenCalled();
    });
  });
});
