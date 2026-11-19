import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CodeQrService } from '../billets/code-qr.service';
import { ResultatPaiementDto } from './dto/paiements.dto';
import { SessionStripe, StripeClient } from './stripe.client';

/** Événements Stripe qui signalent un paiement encaissé. */
const EVENEMENTS_PAYES = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'];
/** Événements Stripe qui signalent un paiement abandonné ou refusé. */
const EVENEMENTS_ECHEC = ['checkout.session.expired', 'checkout.session.async_payment_failed'];

const enCentimes = (montant: number) => Math.round(montant * 100);

@Injectable()
export class PaiementsService {
  private readonly logger = new Logger(PaiementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeClient,
    private readonly codesQr: CodeQrService,
  ) {}

  /** Ouvre une page de paiement Stripe pour une réservation en attente de l'utilisateur. */
  async initier(
    utilisateurId: number,
    reference: string,
    urlSite: string,
  ): Promise<{ url: string }> {
    const reservation = await this.prisma.reservation.findFirst({
      where: { reference, utilisateurId },
      select: {
        id: true,
        reference: true,
        statut: true,
        expireLe: true,
        utilisateur: { select: { email: true } },
        billets: { select: { prixApplique: true } },
        seance: { select: { debut: true, film: { select: { titre: true } } } },
      },
    });
    if (!reservation) throw new NotFoundException('Réservation introuvable.');
    if (
      reservation.statut !== 'EN_ATTENTE' ||
      !reservation.expireLe ||
      reservation.expireLe <= new Date()
    ) {
      throw new ConflictException(
        'Cette réservation ne peut plus être payée : le délai est écoulé ou elle est déjà réglée.',
      );
    }

    const montant = reservation.billets.reduce((somme, b) => somme + Number(b.prixApplique), 0);
    const nbPlaces = reservation.billets.length;
    const session = await this.stripe.creerSessionCheckout({
      reference: reservation.reference,
      montantCentimes: enCentimes(montant),
      libelle: `${reservation.seance.film.titre} – ${nbPlaces} place${nbPlaces > 1 ? 's' : ''} (réf. ${reservation.reference})`,
      email: reservation.utilisateur.email,
      urlSucces: `${urlSite}/?paiement=succes&session_id={CHECKOUT_SESSION_ID}`,
      urlAnnulation: `${urlSite}/?paiement=annule&reference=${reservation.reference}`,
    });
    if (!session.url) throw new ConflictException('La page de paiement n’a pas pu être ouverte.');

    await this.prisma.paiement.create({
      data: {
        reservationId: reservation.id,
        refTransactionPsp: session.id,
        montant,
        statut: 'INITIE',
      },
    });
    return { url: session.url };
  }

  /**
   * Retour du spectateur après la page Stripe : l'état du paiement est relu chez Stripe,
   * jamais déduit de l'adresse de retour. Fonctionne même sans notification (développement local).
   */
  async verifierRetour(utilisateurId: number, sessionId: string): Promise<ResultatPaiementDto> {
    const paiement = await this.prisma.paiement.findUnique({
      where: { refTransactionPsp: sessionId },
      select: { reservation: { select: { reference: true, statut: true, utilisateurId: true } } },
    });
    if (!paiement || paiement.reservation.utilisateurId !== utilisateurId) {
      throw new NotFoundException('Paiement introuvable.');
    }
    const session = await this.stripe.lireSession(sessionId);
    if (session.payment_status !== 'paid') {
      return {
        reference: paiement.reservation.reference,
        statut: paiement.reservation.statut,
        paye: false,
      };
    }
    return this.confirmer(session);
  }

  /** Notification Stripe (webhook) signée. */
  async traiterNotification(
    corpsBrut: Buffer | undefined,
    signature: string | undefined,
  ): Promise<void> {
    const evenement = this.stripe.verifierEvenement(corpsBrut, signature);
    const session = evenement.data.object;
    if (EVENEMENTS_PAYES.includes(evenement.type) && session.payment_status === 'paid') {
      await this.confirmer(session);
    } else if (EVENEMENTS_ECHEC.includes(evenement.type)) {
      await this.prisma.paiement.updateMany({
        where: { refTransactionPsp: session.id, statut: 'INITIE' },
        data: { statut: 'REFUSE' },
      });
    }
  }

  /**
   * Confirme une réservation payée. Idempotent : une même session reçue deux fois
   * (retour du spectateur + notification, ou notification rejouée) ne crée pas deux billets.
   */
  async confirmer(session: SessionStripe): Promise<ResultatPaiementDto> {
    return this.prisma.$transaction(async (tx) => {
      const paiement = await tx.paiement.findUnique({
        where: { refTransactionPsp: session.id },
        select: {
          id: true,
          montant: true,
          reservation: {
            select: {
              id: true,
              reference: true,
              statut: true,
              billets: { select: { id: true, seanceId: true, statut: true } },
            },
          },
        },
      });
      if (!paiement) throw new NotFoundException('Paiement introuvable.');
      const { reservation } = paiement;

      if (session.amount_total !== enCentimes(Number(paiement.montant))) {
        this.logger.error(`Montant Stripe incohérent pour la session ${session.id}`);
        throw new ConflictException('Le montant payé ne correspond pas à la réservation.');
      }

      // Seule la première confirmation fait passer le paiement à ACCEPTE (verrou de ligne MySQL).
      const { count } = await tx.paiement.updateMany({
        where: { id: paiement.id, statut: { not: 'ACCEPTE' } },
        data: { statut: 'ACCEPTE', payeLe: new Date() },
      });
      if (count === 0) {
        return { reference: reservation.reference, statut: reservation.statut, paye: true };
      }

      const placesTenues =
        reservation.statut === 'EN_ATTENTE' &&
        reservation.billets.every((b) => b.statut === 'ACTIF');
      if (!placesTenues) {
        // Paiement arrivé après la libération des places : le spectateur doit être remboursé (US-4.2).
        this.logger.warn(
          `Paiement ${session.id} reçu pour la réservation ${reservation.reference} (${reservation.statut}) : remboursement à effectuer`,
        );
        return {
          reference: reservation.reference,
          statut: reservation.statut,
          paye: true,
          aRembourser: true,
        };
      }

      await tx.reservation.update({
        where: { id: reservation.id },
        data: { statut: 'CONFIRMEE', expireLe: null },
      });
      for (const billet of reservation.billets) {
        await tx.billet.update({
          where: { id: billet.id },
          data: { codeQr: this.codesQr.signer(billet.id, billet.seanceId) },
        });
      }
      this.logger.log(`Réservation ${reservation.reference} payée et confirmée`);
      return { reference: reservation.reference, statut: 'CONFIRMEE', paye: true };
    });
  }
}
