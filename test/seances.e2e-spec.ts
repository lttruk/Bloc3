import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configurerApplication } from '../src/configuration-app';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Programme et plan de salle (e2e, base MySQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seanceVisible: number;
  let seanceNonPubliee: number;
  const ids: Record<string, number> = {};

  const dans = (heures: number) => new Date(Date.now() + heures * 3600 * 1000);

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

    await prisma.billet.deleteMany();
    await prisma.paiement.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.seance.deleteMany();
    await prisma.place.deleteMany();
    await prisma.tarif.deleteMany();
    await prisma.film.deleteMany();
    await prisma.salle.deleteMany();
    await prisma.utilisateur.deleteMany({ where: { email: 'programme@e2e.test' } });

    const salle = await prisma.salle.create({ data: { nom: 'Salle e2e', capacite: 3 } });
    for (const numero of [1, 2, 3]) {
      const p = await prisma.place.create({ data: { salleId: salle.id, rangee: 'A', numero } });
      ids[`place${numero}`] = p.id;
    }
    const tarif = await prisma.tarif.create({ data: { libelle: 'Plein', prix: 11.5 } });
    const publie = await prisma.film.create({
      data: { titre: 'Hors Ligne', dureeMinutes: 100, genre: 'Thriller', statut: 'PUBLIE' },
    });
    const brouillon = await prisma.film.create({
      data: { titre: 'Film en préparation', dureeMinutes: 90, statut: 'BROUILLON' },
    });
    const seance = (filmId: number, debut: Date, statut: 'PUBLIEE' | 'PROGRAMMEE', version: 'VF' | 'VO') =>
      prisma.seance.create({
        data: { filmId, salleId: salle.id, debut, fin: new Date(debut.getTime() + 2 * 3600 * 1000), statut, version },
      });

    seanceVisible = (await seance(publie.id, dans(24), 'PUBLIEE', 'VO')).id;
    await seance(publie.id, dans(48), 'PUBLIEE', 'VF');
    await seance(publie.id, dans(-24), 'PUBLIEE', 'VF');
    seanceNonPubliee = (await seance(publie.id, dans(30), 'PROGRAMMEE', 'VF')).id;
    await seance(brouillon.id, dans(26), 'PUBLIEE', 'VF');

    const client = await prisma.utilisateur.create({
      data: {
        nom: 'E2E',
        prenom: 'Programme',
        email: 'programme@e2e.test',
        motDePasseHash: 'non-utilise',
        consentementRgpdLe: new Date(),
      },
    });
    const reservation = (statut: 'EN_ATTENTE' | 'CONFIRMEE', placeId: number, reference: string) =>
      prisma.reservation.create({
        data: {
          reference,
          utilisateurId: client.id,
          seanceId: seanceVisible,
          statut,
          expireLe: dans(1),
          billets: { create: [{ seanceId: seanceVisible, placeId, tarifId: tarif.id, prixApplique: 11.5 }] },
        },
      });
    await reservation('EN_ATTENTE', ids.place2, 'E2EATTENTE01');
    await reservation('CONFIRMEE', ids.place3, 'E2ECONFIRM01');
  });

  afterAll(() => app.close());

  const serveur = () => app.getHttpServer();

  it('liste uniquement les séances publiées et à venir des films publiés, par ordre chronologique', async () => {
    const reponse = await request(serveur()).get('/seances');
    expect(reponse.status).toBe(200);
    expect(reponse.body).toHaveLength(2);
    expect(reponse.body[0].id).toBe(seanceVisible);
    expect(reponse.body[0].film.titre).toBe('Hors Ligne');
  });

  it('filtre par version', async () => {
    const reponse = await request(serveur()).get('/seances').query({ version: 'VO' });
    expect(reponse.body.map((s: { id: number }) => s.id)).toEqual([seanceVisible]);
  });

  it('refuse un filtre invalide (400)', async () => {
    const reponse = await request(serveur()).get('/seances').query({ version: 'VOSTFR' });
    expect(reponse.status).toBe(400);
  });

  it('affiche le plan de salle avec l’état de chaque place et les tarifs', async () => {
    const reponse = await request(serveur()).get(`/seances/${seanceVisible}/places`);
    expect(reponse.status).toBe(200);
    const statuts = Object.fromEntries(
      reponse.body.places.map((p: { id: number; statut: string }) => [p.id, p.statut]),
    );
    expect(statuts).toEqual({
      [ids.place1]: 'LIBRE',
      [ids.place2]: 'EN_COURS',
      [ids.place3]: 'OCCUPEE',
    });
    expect(reponse.body.tarifs[0]).toMatchObject({ libelle: 'Plein', prix: 11.5 });
  });

  it('ne donne pas accès au plan d’une séance non publiée (404)', async () => {
    const reponse = await request(serveur()).get(`/seances/${seanceNonPubliee}/places`);
    expect(reponse.status).toBe(404);
  });
});
