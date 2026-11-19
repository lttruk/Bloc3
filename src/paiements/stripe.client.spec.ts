import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { adresseTransmissible, StripeClient, TOLERANCE_SIGNATURE_S } from './stripe.client';

const SECRET = 'whsec_test_secret';
const config = (valeurs: Record<string, string>) =>
  ({ get: (cle: string) => valeurs[cle] }) as unknown as ConfigService;

function signer(corps: string, horodatage = Math.floor(Date.now() / 1000), secret = SECRET) {
  const v1 = createHmac('sha256', secret).update(`${horodatage}.${corps}`).digest('hex');
  return `t=${horodatage},v1=${v1}`;
}

describe('StripeClient', () => {
  const client = new StripeClient(
    config({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: SECRET }),
  );
  const evenement = JSON.stringify({
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_test_1' } },
  });

  const fetchOriginal = global.fetch;
  const fetchSimule = jest.fn();
  const reponse = (status: number, corps: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => corps,
  });

  beforeEach(() => {
    fetchSimule.mockReset();
    global.fetch = fetchSimule as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = fetchOriginal;
  });

  describe('verifierEvenement', () => {
    it('accepte une notification correctement signée', () => {
      const resultat = client.verifierEvenement(Buffer.from(evenement), signer(evenement));
      expect(resultat.data.object.id).toBe('cs_test_1');
    });

    it('rejette une signature fausse, un corps modifié ou une autre clé', () => {
      expect(() => client.verifierEvenement(Buffer.from(evenement), 't=1,v1=abc')).toThrow(
        BadRequestException,
      );
      expect(() =>
        client.verifierEvenement(
          Buffer.from(evenement.replace('cs_test_1', 'cs_test_2')),
          signer(evenement),
        ),
      ).toThrow('Signature Stripe invalide.');
      expect(() =>
        client.verifierEvenement(
          Buffer.from(evenement),
          signer(evenement, undefined, 'whsec_autre'),
        ),
      ).toThrow('Signature Stripe invalide.');
    });

    it('rejette une notification trop ancienne (rejeu)', () => {
      const ancien = Math.floor(Date.now() / 1000) - TOLERANCE_SIGNATURE_S - 10;
      expect(() =>
        client.verifierEvenement(Buffer.from(evenement), signer(evenement, ancien)),
      ).toThrow('Notification Stripe trop ancienne.');
    });

    it('rejette une notification sans corps ou sans en-tête', () => {
      expect(() => client.verifierEvenement(undefined, 'x')).toThrow(BadRequestException);
      expect(() => client.verifierEvenement(Buffer.from(evenement), undefined)).toThrow(
        BadRequestException,
      );
      expect(() => client.verifierEvenement(Buffer.from(evenement), 'v1=abc')).toThrow(
        'Signature Stripe illisible.',
      );
    });

    it('refuse les notifications si le secret n’est pas configuré', () => {
      const sansSecret = new StripeClient(config({ STRIPE_SECRET_KEY: 'sk_test_x' }));
      expect(() => sansSecret.verifierEvenement(Buffer.from(evenement), signer(evenement))).toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('appels à l’API', () => {
    it('crée une session Checkout en euros avec la référence de la réservation', async () => {
      fetchSimule.mockResolvedValue(reponse(200, { id: 'cs_test_1', url: 'https://checkout' }));
      const session = await client.creerSessionCheckout({
        reference: 'REF123',
        montantCentimes: 2300,
        libelle: 'Hors Ligne – 2 places',
        email: 'a@b.fr',
        urlSucces: 'https://site/ok',
        urlAnnulation: 'https://site/ko',
      });
      expect(session.id).toBe('cs_test_1');
      const [url, options] = fetchSimule.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.stripe.com/v1/checkout/sessions');
      expect((options.headers as Record<string, string>).Authorization).toBe('Bearer sk_test_x');
      const corps = new URLSearchParams(String(options.body));
      expect(corps.get('line_items[0][price_data][unit_amount]')).toBe('2300');
      expect(corps.get('line_items[0][price_data][currency]')).toBe('eur');
      expect(corps.get('client_reference_id')).toBe('REF123');
      // Les moyens de paiement sont réglés dans le tableau de bord Stripe, plus dans la requête
      expect(corps.has('payment_method_types[0]')).toBe(false);
      expect(corps.get('customer_email')).toBe('a@b.fr');
    });

    it('relit une session et refuse un identifiant douteux', async () => {
      fetchSimule.mockResolvedValue(reponse(200, { id: 'cs_test_1' }));
      await client.lireSession('cs_test_1');
      expect(fetchSimule.mock.calls[0][0]).toBe(
        'https://api.stripe.com/v1/checkout/sessions/cs_test_1',
      );
      await expect(client.lireSession('../balance')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('traduit une erreur ou une panne de Stripe en 502', async () => {
      fetchSimule
        .mockResolvedValueOnce(reponse(401, { error: { message: 'clé invalide' } }))
        .mockRejectedValueOnce(new Error('réseau'));
      await expect(client.lireSession('cs_test_1')).rejects.toBeInstanceOf(BadGatewayException);
      await expect(client.lireSession('cs_test_1')).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('signale un paiement non configuré', async () => {
      const sansCle = new StripeClient(config({}));
      await expect(sansCle.lireSession('cs_test_1')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  it('ne préremplit pas les adresses de démonstration sur des domaines réservés', () => {
    expect(adresseTransmissible('camille@gmail.com')).toBe(true);
    expect(adresseTransmissible('spectateur@lagrandecinema.test')).toBe(false);
    expect(adresseTransmissible('a@site.example')).toBe(false);
    expect(adresseTransmissible('a@poste.local ')).toBe(false);
  });
});
