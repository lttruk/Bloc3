import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configurerApplication } from '../src/configuration-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { LiberationPlacesTask } from '../src/reservations/liberation-places.task';

describe('POST /seances/:id/reservations (e2e, base MySQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jetons: string[];
  let seanceId: number;
  let placeId: number;
  let tarifId: number;

  const reserver = (jeton: string, place = placeId) =>
    request(app.getHttpServer())
      .post(`/seances/${seanceId}/reservations`)
      .set('Authorization', `Bearer ${jeton}`)
      .send({ places: [{ placeId: place, tarifId }] });

  beforeAll(async () => {
    // Sécurité : ces tests vident les tables, ils ne doivent jamais viser une vraie base.
    if (!/test/i.test(process.env.DATABASE_URL ?? '')) {
      throw new Error('DATABASE_URL doit désigner une base de test (son nom doit contenir « test »).');
    }
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configurerApplication(app);
    await app.init();
    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);

    await prisma.billet.deleteMany();
    await prisma.paiement.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.seance.deleteMany();
    await prisma.place.deleteMany();
    await prisma.tarif.deleteMany();
    await prisma.film.deleteMany();
    await prisma.salle.deleteMany();
    await prisma.utilisateur.deleteMany();

    const salle = await prisma.salle.create({ data: { nom: 'Salle test', capacite: 2 } });
    const places = await Promise.all(
      [1, 2].map((numero) =>
        prisma.place.create({ data: { salleId: salle.id, rangee: 'A', numero } }),
      ),
    );
    placeId = places[0].id;
    const film = await prisma.film.create({
      data: { titre: 'Film test', dureeMinutes: 100, statut: 'PUBLIE' },
    });
    const debut = new Date(Date.now() + 24 * 3600 * 1000);
    const seance = await prisma.seance.create({
      data: {
        filmId: film.id,
        salleId: salle.id,
        debut,
        fin: new Date(debut.getTime() + 115 * 60 * 1000),
        statut: 'PUBLIEE',
      },
    });
    seanceId = seance.id;
    tarifId = (await prisma.tarif.create({ data: { libelle: 'Plein', prix: 11.5 } })).id;

    const utilisateurs = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        prisma.utilisateur.create({
          data: {
            nom: 'Test',
            prenom: `Client ${i}`,
            email: `client${i}@test.local`,
            motDePasseHash: 'non-utilise-dans-ces-tests',
            consentementRgpdLe: new Date(),
          },
        }),
      ),
    );
    jetons = utilisateurs.map((u) => jwt.sign({ sub: u.id, role: u.role }));
  });

  afterAll(() => app.close());

  beforeEach(async () => {
    await prisma.billet.deleteMany();
    await prisma.reservation.deleteMany();
  });

  it('refuse un client non authentifié (401)', async () => {
    await request(app.getHttpServer())
      .post(`/seances/${seanceId}/reservations`)
      .send({ places: [{ placeId, tarifId }] })
      .expect(401);
  });

  it('refuse plus de 10 places (400)', async () => {
    const places = Array.from({ length: 11 }, (_, i) => ({ placeId: i + 1, tarifId }));
    await request(app.getHttpServer())
      .post(`/seances/${seanceId}/reservations`)
      .set('Authorization', `Bearer ${jetons[0]}`)
      .send({ places })
      .expect(400);
  });

  it('verrouille une place libre (201)', async () => {
    const reponse = await reserver(jetons[0]).expect(201);
    expect(reponse.body).toMatchObject({ statut: 'EN_ATTENTE', nombrePlaces: 1 });
  });

  it('refuse une place déjà verrouillée (409)', async () => {
    await reserver(jetons[0]).expect(201);
    const refus = await reserver(jetons[1]);
    expect(refus.status).toBe(409);
  });

  it('une seule réservation réussit quand 20 clients visent la même place', async () => {
    const statuts = (await Promise.all(jetons.map((j) => reserver(j)))).map((r) => r.status);

    expect(statuts.filter((s) => s === 201)).toHaveLength(1);
    expect(statuts.filter((s) => s === 409)).toHaveLength(19);
    expect(
      await prisma.billet.count({ where: { seanceId, placeId, statut: { not: 'ANNULE' } } }),
    ).toBe(1);
  });

  it('libère la place quand le verrou expire', async () => {
    await reserver(jetons[0]).expect(201);
    await prisma.reservation.updateMany({ data: { expireLe: new Date(Date.now() - 1000) } });
    await app.get(LiberationPlacesTask).libererPlacesExpirees();
    const nouvelle = await reserver(jetons[1]);
    expect(nouvelle.status).toBe(201);
  });
});
