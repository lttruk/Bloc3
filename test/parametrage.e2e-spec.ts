import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configurerApplication } from '../src/configuration-app';
import { PrismaService } from '../src/prisma/prisma.service';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Tarifs et salles – US-7.2 (e2e, base MySQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jetonAdmin: string;
  let jetonProg: string;
  let salleId: number;
  let filmId: number;
  let ancienneSeance: number;

  const http = () => request(app.getHttpServer());
  const positions = (plan: { places: { rangee: string; numero: number }[] }) =>
    plan.places.map((p) => `${p.rangee}${p.numero}`).sort();

  beforeAll(async () => {
    if (!/test/i.test(process.env.DATABASE_URL ?? '')) {
      throw new Error(
        'DATABASE_URL doit désigner une base de test (son nom doit contenir « test »).',
      );
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
    await prisma.utilisateur.deleteMany();

    const creer = async (role: 'ADMIN' | 'PROGRAMMATION') => {
      const u = await prisma.utilisateur.create({
        data: {
          nom: 'Test',
          prenom: role,
          email: `${role.toLowerCase()}@param.test`,
          role,
          motDePasseHash: 'x',
          consentementRgpdLe: new Date(),
        },
      });
      return jwt.sign({ sub: u.id, role });
    };
    jetonAdmin = await creer('ADMIN');
    jetonProg = await creer('PROGRAMMATION');

    const passe = new Date('2026-01-01T00:00:00Z');
    salleId = (await prisma.salle.create({ data: { nom: 'Salle modulable', capacite: 2 } })).id;
    await prisma.place.createMany({
      data: [1, 2].map((numero) => ({ salleId, rangee: 'A', numero, ajouteeLe: passe })),
    });
    filmId = (
      await prisma.film.create({
        data: { titre: 'Film modulable', dureeMinutes: 90, statut: 'PUBLIE' },
      })
    ).id;
    await prisma.tarif.create({ data: { libelle: 'Plein', prix: 11.5 } });
    const debut = new Date(Date.now() + 24 * 3600 * 1000);
    ancienneSeance = (
      await prisma.seance.create({
        data: {
          filmId,
          salleId,
          debut,
          fin: new Date(debut.getTime() + 105 * 60_000),
          statut: 'PUBLIEE',
          creeeLe: new Date(Date.now() - 3600_000),
        },
      })
    ).id;
  });

  afterAll(() => app.close());

  it('réserve le paramétrage à l’administrateur', async () => {
    await http().get('/admin/tarifs').expect(401);
    await http().get('/admin/tarifs').set('Authorization', `Bearer ${jetonProg}`).expect(403);
    await http().get('/admin/tarifs').set('Authorization', `Bearer ${jetonAdmin}`).expect(200);
  });

  it('crée un tarif, puis le désactive : il disparaît du plan de salle', async () => {
    const cree = await http()
      .post('/admin/tarifs')
      .set('Authorization', `Bearer ${jetonAdmin}`)
      .send({ libelle: 'Étudiant', prix: 8.5, justificatifRequis: true })
      .expect(201);
    let plan = await http().get(`/seances/${ancienneSeance}/places`).expect(200);
    expect(plan.body.tarifs.map((t: { libelle: string }) => t.libelle)).toContain('Étudiant');

    await http()
      .patch(`/admin/tarifs/${cree.body.id}`)
      .set('Authorization', `Bearer ${jetonAdmin}`)
      .send({ actif: false })
      .expect(200);
    plan = await http().get(`/seances/${ancienneSeance}/places`).expect(200);
    expect(plan.body.tarifs.map((t: { libelle: string }) => t.libelle)).not.toContain('Étudiant');

    await http()
      .post('/admin/tarifs')
      .set('Authorization', `Bearer ${jetonAdmin}`)
      .send({ libelle: 'Étudiant', prix: 7 })
      .expect(409);
  });

  it('reconfigure la salle pour les nouvelles séances uniquement', async () => {
    const config = await http()
      .put(`/admin/salles/${salleId}/configuration`)
      .set('Authorization', `Bearer ${jetonAdmin}`)
      .send({
        rangees: [
          { rangee: 'A', places: 1 },
          { rangee: 'B', places: 2, pmr: [1] },
        ],
      })
      .expect(200);
    expect(config.body.salle.capacite).toBe(3);

    // La séance programmée avant garde son plan d'origine (A1, A2)
    const ancien = await http().get(`/seances/${ancienneSeance}/places`).expect(200);
    expect(positions(ancien.body)).toEqual(['A1', 'A2']);

    // Une séance créée après prend la nouvelle configuration (A1, B1, B2)
    await pause(1100);
    const debut = new Date(Date.now() + 48 * 3600 * 1000);
    const nouvelle = await http()
      .post('/admin/seances')
      .set('Authorization', `Bearer ${jetonProg}`)
      .send({ filmId, salleId, debut: debut.toISOString() })
      .expect(201);
    await http()
      .patch(`/admin/seances/${nouvelle.body.id}/statut`)
      .set('Authorization', `Bearer ${jetonProg}`)
      .send({ statut: 'PUBLIEE' })
      .expect(200);
    const plan = await http().get(`/seances/${nouvelle.body.id}/places`).expect(200);
    expect(positions(plan.body)).toEqual(['A1', 'B1', 'B2']);
    expect(
      plan.body.places.find(
        (p: { rangee: string; numero: number }) => p.rangee === 'B' && p.numero === 1,
      ).type,
    ).toBe('PMR');
  });
});
