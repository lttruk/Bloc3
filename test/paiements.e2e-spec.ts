import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configurerApplication } from '../src/configuration-app';
import { PrismaService } from '../src/prisma/prisma.service';

const SECRET_WEBHOOK = 'whsec_e2e_test';
const SESSION = 'cs_test_e2e_paiement';

function notificationSignee(evenement: object, secret = SECRET_WEBHOOK) {
  const corps = JSON.stringify(evenement);
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', secret).update(`${t}.${corps}`).digest('hex');
  return { corps, signature: `t=${t},v1=${v1}` };
}

describe('Paiement Stripe – US-4.1 (e2e, base MySQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reservationId: number;

  const envoyer = (corps: string, signature: string) =>
    request(app.getHttpServer())
      .post('/paiements/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', signature)
      .send(corps);

  beforeAll(async () => {
    if (!/test/i.test(process.env.DATABASE_URL ?? '')) {
      throw new Error(
        'DATABASE_URL doit désigner une base de test (son nom doit contenir « test »).',
      );
    }
    process.env.STRIPE_WEBHOOK_SECRET = SECRET_WEBHOOK;
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ rawBody: true });
    configurerApplication(app);
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.billet.deleteMany();
    await prisma.paiement.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.seance.deleteMany();
    await prisma.place.deleteMany();
    await prisma.tarif.deleteMany();
    await prisma.film.deleteMany();
    await prisma.salle.deleteMany();
    await prisma.journalAdmin.deleteMany();
    await prisma.utilisateur.deleteMany();

    const salle = await prisma.salle.create({ data: { nom: 'Salle paiement', capacite: 2 } });
    const places = await Promise.all(
      [1, 2].map((numero) =>
        prisma.place.create({ data: { salleId: salle.id, rangee: 'A', numero } }),
      ),
    );
    const film = await prisma.film.create({
      data: { titre: 'Film payé', dureeMinutes: 90, statut: 'PUBLIE' },
    });
    const debut = new Date(Date.now() + 24 * 3600 * 1000);
    const seance = await prisma.seance.create({
      data: {
        filmId: film.id,
        salleId: salle.id,
        debut,
        fin: new Date(debut.getTime() + 105 * 60_000),
        statut: 'PUBLIEE',
      },
    });
    const tarif = await prisma.tarif.create({ data: { libelle: 'Plein', prix: 11.5 } });
    const client = await prisma.utilisateur.create({
      data: {
        nom: 'Test',
        prenom: 'Payeur',
        email: 'payeur@test.local',
        motDePasseHash: 'x',
        consentementRgpdLe: new Date(),
      },
    });
    const reservation = await prisma.reservation.create({
      data: {
        utilisateurId: client.id,
        seanceId: seance.id,
        reference: 'PAIEMENTE2E1',
        statut: 'EN_ATTENTE',
        expireLe: new Date(Date.now() + 10 * 60_000),
        billets: {
          create: places.map((p) => ({
            seanceId: seance.id,
            placeId: p.id,
            tarifId: tarif.id,
            prixApplique: 11.5,
          })),
        },
      },
    });
    reservationId = reservation.id;
    await prisma.paiement.create({
      data: { reservationId, refTransactionPsp: SESSION, montant: 23, statut: 'INITIE' },
    });
  });

  afterAll(async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    await app.close();
  });

  const evenementPaye = {
    id: 'evt_e2e',
    type: 'checkout.session.completed',
    data: {
      object: { id: SESSION, payment_status: 'paid', status: 'complete', amount_total: 2300 },
    },
  };

  it('refuse une notification dont la signature est fausse', async () => {
    const { corps } = notificationSignee(evenementPaye);
    const { signature } = notificationSignee(evenementPaye, 'whsec_pirate');
    await envoyer(corps, signature).expect(400);
    expect(
      (await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } })).statut,
    ).toBe('EN_ATTENTE');
  });

  it('confirme la réservation et génère les QR codes à la notification de paiement', async () => {
    const { corps, signature } = notificationSignee(evenementPaye);
    await envoyer(corps, signature).expect(200);
    const reservation = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservationId },
      include: { billets: true, paiements: true },
    });
    expect(reservation.statut).toBe('CONFIRMEE');
    expect(reservation.paiements[0].statut).toBe('ACCEPTE');
    expect(reservation.billets.every((b) => b.codeQr?.startsWith('LGC1.'))).toBe(true);
  });

  it('ignore une notification rejouée : aucun billet en double, QR codes inchangés', async () => {
    const avant = await prisma.billet.findMany({
      where: { reservationId },
      orderBy: { id: 'asc' },
    });
    const { corps, signature } = notificationSignee(evenementPaye);
    await envoyer(corps, signature).expect(200);
    const apres = await prisma.billet.findMany({
      where: { reservationId },
      orderBy: { id: 'asc' },
    });
    expect(apres).toHaveLength(2);
    expect(apres.map((b) => b.codeQr)).toEqual(avant.map((b) => b.codeQr));
  });
});
