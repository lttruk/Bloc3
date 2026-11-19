import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

const API_STRIPE = 'https://api.stripe.com/v1';
/** Écart maximal accepté entre l'horodatage signé d'une notification et l'heure du serveur. */
export const TOLERANCE_SIGNATURE_S = 300;

/** Domaines réservés (RFC 2606) des comptes de démonstration : aucune boîte aux lettres réelle. */
const DOMAINES_RESERVES = /\.(test|example|invalid|localhost|local)$/i;

/** Adresse préremplie sur la page Stripe, sauf adresse de démonstration (saisie alors sur la page). */
export function adresseTransmissible(email: string): boolean {
  return !DOMAINES_RESERVES.test(email.trim());
}

export interface SessionStripe {
  id: string;
  url: string | null;
  status: 'open' | 'complete' | 'expired';
  payment_status: 'paid' | 'unpaid' | 'no_payment_required';
  amount_total: number | null;
  client_reference_id: string | null;
}

export interface EvenementStripe {
  id: string;
  type: string;
  data: { object: SessionStripe };
}

export interface NouvelleSession {
  reference: string;
  montantCentimes: number;
  libelle: string;
  email: string;
  urlSucces: string;
  urlAnnulation: string;
}

/**
 * Accès au prestataire de paiement Stripe (US-4.1) par son API HTTP.
 * La carte est saisie sur la page Stripe Checkout : aucune donnée bancaire ne transite par l'application.
 */
@Injectable()
export class StripeClient {
  private readonly logger = new Logger(StripeClient.name);
  private readonly cle?: string;
  private readonly secretWebhook?: string;

  constructor(config: ConfigService) {
    this.cle = config.get<string>('STRIPE_SECRET_KEY') || undefined;
    this.secretWebhook = config.get<string>('STRIPE_WEBHOOK_SECRET') || undefined;
  }

  creerSessionCheckout(s: NouvelleSession): Promise<SessionStripe> {
    return this.appeler('POST', '/checkout/sessions', {
      mode: 'payment',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][unit_amount]': String(s.montantCentimes),
      'line_items[0][price_data][product_data][name]': s.libelle,
      client_reference_id: s.reference,
      'metadata[reference]': s.reference,
      ...(adresseTransmissible(s.email) ? { customer_email: s.email } : {}),
      success_url: s.urlSucces,
      cancel_url: s.urlAnnulation,
    });
  }

  async lireSession(id: string): Promise<SessionStripe> {
    if (!/^cs_[\w]+$/.test(id)) throw new BadRequestException('Identifiant de session invalide.');
    return this.appeler('GET', `/checkout/sessions/${id}`);
  }

  /** Vérifie la signature d'une notification Stripe (en-tête Stripe-Signature) et renvoie l'événement. */
  verifierEvenement(corpsBrut: Buffer | undefined, entete: string | undefined): EvenementStripe {
    if (!this.secretWebhook)
      throw new ServiceUnavailableException('Notifications Stripe non configurées.');
    if (!corpsBrut || !entete) throw new BadRequestException('Notification Stripe incomplète.');

    const elements = entete.split(',').map((e) => e.split('=') as [string, string]);
    const horodatage = Number(elements.find(([cle]) => cle === 't')?.[1]);
    const signatures = elements.filter(([cle]) => cle === 'v1').map(([, valeur]) => valeur);
    if (!Number.isFinite(horodatage) || signatures.length === 0) {
      throw new BadRequestException('Signature Stripe illisible.');
    }
    if (Math.abs(Date.now() / 1000 - horodatage) > TOLERANCE_SIGNATURE_S) {
      throw new BadRequestException('Notification Stripe trop ancienne.');
    }
    const attendue = Buffer.from(
      createHmac('sha256', this.secretWebhook)
        .update(`${horodatage}.${corpsBrut.toString('utf8')}`)
        .digest('hex'),
    );
    const authentique = signatures.some((s) => {
      const recue = Buffer.from(s);
      return recue.length === attendue.length && timingSafeEqual(recue, attendue);
    });
    if (!authentique) throw new BadRequestException('Signature Stripe invalide.');
    return JSON.parse(corpsBrut.toString('utf8')) as EvenementStripe;
  }

  private async appeler(
    methode: 'GET' | 'POST',
    chemin: string,
    parametres?: Record<string, string>,
  ): Promise<SessionStripe> {
    if (!this.cle)
      throw new ServiceUnavailableException('Le paiement en ligne n’est pas configuré.');
    let reponse: Response;
    try {
      reponse = await fetch(`${API_STRIPE}${chemin}`, {
        method: methode,
        headers: {
          Authorization: `Bearer ${this.cle}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: parametres ? new URLSearchParams(parametres).toString() : undefined,
      });
    } catch (e) {
      this.logger.error(`Stripe injoignable : ${(e as Error).message}`);
      throw new BadGatewayException('Le service de paiement est momentanément indisponible.');
    }
    const corps = (await reponse.json()) as SessionStripe & { error?: { message?: string } };
    if (!reponse.ok) {
      this.logger.error(`Erreur Stripe ${reponse.status} : ${corps.error?.message ?? 'inconnue'}`);
      throw new BadGatewayException('Le service de paiement a refusé la demande.');
    }
    return corps;
  }
}
