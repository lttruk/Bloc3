import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configurerApplication } from '../src/configuration-app';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Mes réservations (e2e, base MySQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jetonAlice: string;
  let jetonBob: string;
  let seanceId: number;
  let placeId: number;
  let tarifId: number;

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
    await prisma.journalAdmin.deleteMany();
    await prisma.utilisateur.deleteMany({ where: { email: { endsWith: '@mes-reservations.test' } } });

    const salle = await prisma.salle.create({ data: { nom: 'Salle e2e', capacite: 1 } });
    placeId = (await prisma.place.create({ data: { salleId: salle.id, rangee: 'A', numero: 1 } })).id;
    tarifId = (await prisma.tarif.create({ data: { libelle: 'Plein', prix: 11.5 } })).id;
    const film = await prisma.film.create({
      data: { titre: 'Mode Avion', dureeMinutes: 95, statut: 'PUBLIE' },
    });
    const debut = new Date(Date.now() + 24 * 3600 * 1000);
    seanceId = (
      await prisma.seance.create({
        data: { filmId: film.id, salleId: salle.id, debut, fin: new Date(debut.getTime() + 2 * 3600 * 1000), statut: 'PUBLIEE' },
      })
    ).id;

    const creer = (prenom: string) =>
      prisma.utilisateur.create({
        data: {
          nom: 'E2E',
          prenom,
          email: `${prenom.toLowerCase()}@mes-reservations.test`,
          motDePasseHash: 'non-utilise',
          consentementRgpdLe: new Date(),
        },
      });
    const [alice, bob] = await Promise.all([creer('Alice'), creer('Bob')]);
    jetonAlice = jwt.sign({ sub: alice.id, role: alice.role });
    jetonBob = jwt.sign({ sub: bob.id, role: bob.role });
  });

  afterAll(() => app.close());

  const serveur = () => app.getHttpServer();

  it('refuse l’accès sans jeton (401)', async () => {
    const reponse = await request(serveur()).get('/reservations/moi');
    expect(reponse.status).toBe(401);
  });

  it('retrouve, protège puis libère une réservation en attente', async () => {
    const creation = await request(serveur())
      .post(`/seances/${seanceId}/reservations`)
      .set('Authorization', `Bearer ${jetonAlice}`)
      .send({ places: [{ placeId, tarifId }] });
    expect(creation.status).toBe(201);
    const { reference } = creation.body;

    const liste = await request(serveur()).get('/reservations/moi').set('Authorization', `Bearer ${jetonAlice}`);
    expect(liste.status).toBe(200);
    expect(liste.body).toHaveLength(1);
    expect(liste.body[0]).toMatchObject({ reference, statut: 'EN_ATTENTE', film: 'Mode Avion', total: 11.5 });

    const listeBob = await request(serveur()).get('/reservations/moi').set('Authorization', `Bearer ${jetonBob}`);
    expect(listeBob.body).toHaveLength(0);

    const parBob = await request(serveur()).delete(`/reservations/${reference}`).set('Authorization', `Bearer ${jetonBob}`);
    expect(parBob.status).toBe(404);

    const liberation = await request(serveur()).delete(`/reservations/${reference}`).set('Authorization', `Bearer ${jetonAlice}`);
    expect(liberation.status).toBe(204);

    const plan = await request(serveur()).get(`/seances/${seanceId}/places`);
    expect(plan.body.places[0].statut).toBe('LIBRE');

    const deuxiemeFois = await request(serveur()).delete(`/reservations/${reference}`).set('Authorization', `Bearer ${jetonAlice}`);
    expect(deuxiemeFois.status).toBe(409);
  });
});
