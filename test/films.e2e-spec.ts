import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configurerApplication } from '../src/configuration-app';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Fiche détaillée d’un film – US-1.2 (e2e, base MySQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jetonAdmin: string;
  let filmId: number;
  let filmBrouillon: number;
  let seanceOuverte: number;
  let seanceComplete: number;

  const dans = (heures: number) => new Date(Date.now() + heures * 3600 * 1000);
  const http = () => request(app.getHttpServer());

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

    await prisma.billet.deleteMany();
    await prisma.paiement.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.seance.deleteMany();
    await prisma.place.deleteMany();
    await prisma.tarif.deleteMany();
    await prisma.film.deleteMany();
    await prisma.salle.deleteMany();
    await prisma.journalAdmin.deleteMany();
    await prisma.utilisateur.deleteMany({
      where: { email: { in: ['fiche@e2e.test', 'admin-fiche@e2e.test'] } },
    });

    const salle = await prisma.salle.create({ data: { nom: 'Salle fiche', capacite: 2 } });
    const places = await Promise.all(
      [1, 2].map((numero) =>
        prisma.place.create({ data: { salleId: salle.id, rangee: 'A', numero } }),
      ),
    );
    const tarif = await prisma.tarif.create({ data: { libelle: 'Plein', prix: 11.5 } });
    await prisma.tarif.create({ data: { libelle: 'Ancien tarif', prix: 5, actif: false } });

    const film = await prisma.film.create({
      data: {
        titre: 'Hors Ligne',
        synopsis: 'Une panne mondiale coupe tous les réseaux.',
        dureeMinutes: 100,
        genre: 'Thriller',
        classification: 'Tous publics',
        bandeAnnonceUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
        statut: 'PUBLIE',
      },
    });
    filmId = film.id;
    filmBrouillon = (
      await prisma.film.create({ data: { titre: 'En préparation', dureeMinutes: 90 } })
    ).id;

    const seance = (debut: Date, statut: 'PUBLIEE' | 'PROGRAMMEE' = 'PUBLIEE') =>
      prisma.seance.create({
        data: {
          filmId,
          salleId: salle.id,
          debut,
          fin: new Date(debut.getTime() + 2 * 3600 * 1000),
          statut,
          version: 'VF',
        },
      });
    seanceOuverte = (await seance(dans(26))).id;
    seanceComplete = (await seance(dans(50))).id;
    await seance(dans(-24));
    await seance(dans(30), 'PROGRAMMEE');

    const client = await prisma.utilisateur.create({
      data: {
        nom: 'E2E',
        prenom: 'Fiche',
        email: 'fiche@e2e.test',
        motDePasseHash: 'non-utilise',
        consentementRgpdLe: new Date(),
      },
    });
    await prisma.reservation.create({
      data: {
        reference: 'FICHECOMPLET',
        utilisateurId: client.id,
        seanceId: seanceComplete,
        statut: 'CONFIRMEE',
        billets: {
          create: places.map((p) => ({
            seanceId: seanceComplete,
            placeId: p.id,
            tarifId: tarif.id,
            prixApplique: 11.5,
          })),
        },
      },
    });

    const admin = await prisma.utilisateur.create({
      data: {
        nom: 'E2E',
        prenom: 'Admin',
        email: 'admin-fiche@e2e.test',
        motDePasseHash: 'non-utilise',
        consentementRgpdLe: new Date(),
        role: 'ADMIN',
      },
    });
    jetonAdmin = app.get(JwtService).sign({ sub: admin.id, role: 'ADMIN' });
  });

  afterAll(() => app.close());

  it('affiche synopsis, durée, classification, bande-annonce et tarifs actifs', async () => {
    const { body } = await http().get(`/films/${filmId}`).expect(200);
    expect(body).toMatchObject({
      titre: 'Hors Ligne',
      synopsis: 'Une panne mondiale coupe tous les réseaux.',
      dureeMinutes: 100,
      classification: 'Tous publics',
      bandeAnnonceUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
    });
    expect(body.tarifs.map((t: { libelle: string }) => t.libelle)).toEqual(['Plein']);
  });

  it('liste les seules séances publiées à venir, avec leur disponibilité', async () => {
    const { body } = await http().get(`/films/${filmId}`).expect(200);
    expect(body.seances.map((s: { id: number }) => s.id)).toEqual([seanceOuverte, seanceComplete]);
    expect(body.seances[0]).toMatchObject({ capacite: 2, placesLibres: 2 });
    expect(body.seances[1]).toMatchObject({ placesLibres: 0, disponibilite: 'COMPLET' });
  });

  it('n’autorise en iframe que les lecteurs vidéo YouTube et Vimeo', async () => {
    const reponse = await http().get(`/films/${filmId}`).expect(200);
    expect(reponse.headers['content-security-policy']).toContain(
      "frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com",
    );
  });

  it('refuse un film non publié ou inexistant (404)', async () => {
    await http().get(`/films/${filmBrouillon}`).expect(404);
    await http().get('/films/999999').expect(404);
  });

  it('permet à l’administrateur de renseigner puis retirer la bande-annonce (https uniquement)', async () => {
    const auth = `Bearer ${jetonAdmin}`;
    await http()
      .patch(`/admin/films/${filmId}`)
      .set('Authorization', auth)
      .send({ bandeAnnonceUrl: 'http://exemple.test/video' })
      .expect(400);
    await http()
      .patch(`/admin/films/${filmId}`)
      .set('Authorization', auth)
      .send({ bandeAnnonceUrl: 'https://vimeo.com/123456' })
      .expect(200);
    expect((await http().get(`/films/${filmId}`)).body.bandeAnnonceUrl).toBe(
      'https://vimeo.com/123456',
    );
    await http()
      .patch(`/admin/films/${filmId}`)
      .set('Authorization', auth)
      .send({ bandeAnnonceUrl: '' })
      .expect(200);
    expect((await http().get(`/films/${filmId}`)).body.bandeAnnonceUrl).toBeNull();
  });
});
