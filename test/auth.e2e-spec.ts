import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configurerApplication } from '../src/configuration-app';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Authentification (e2e, base MySQL)', () => {
  const email = 'inscription@e2e.test';
  const motDePasse = 'MotDePasse2027';
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    // Sécurité : ces tests écrivent en base, ils ne doivent jamais viser une vraie base.
    if (!/test/i.test(process.env.DATABASE_URL ?? '')) {
      throw new Error('DATABASE_URL doit désigner une base de test (son nom doit contenir « test »).');
    }
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configurerApplication(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.utilisateur.deleteMany({ where: { email } });
  });

  afterAll(async () => {
    await prisma.utilisateur.deleteMany({ where: { email } });
    await app.close();
  });

  const serveur = () => app.getHttpServer();

  it('inscrit un spectateur sans jamais renvoyer son mot de passe', async () => {
    const reponse = await request(serveur())
      .post('/auth/inscription')
      .send({ nom: 'Durand', prenom: 'Camille', email: 'Inscription@E2E.test', motDePasse, consentementRgpd: true })
      .expect(201);
    expect(reponse.body).toMatchObject({ email, role: 'CLIENT' });
    expect(reponse.body.motDePasseHash).toBeUndefined();
  });

  it('refuse une seconde inscription avec le même e-mail (409)', async () => {
    const reponse = await request(serveur())
      .post('/auth/inscription')
      .send({ nom: 'Durand', prenom: 'Camille', email, motDePasse, consentementRgpd: true });
    expect(reponse.status).toBe(409);
  });

  it('refuse une inscription sans consentement RGPD ou avec un mot de passe faible (400)', async () => {
    const sansConsentement = await request(serveur())
      .post('/auth/inscription')
      .send({ nom: 'A', prenom: 'B', email: 'autre@e2e.test', motDePasse, consentementRgpd: false });
    const motDePasseFaible = await request(serveur())
      .post('/auth/inscription')
      .send({ nom: 'A', prenom: 'B', email: 'autre@e2e.test', motDePasse: 'court', consentementRgpd: true });
    expect(sansConsentement.status).toBe(400);
    expect(motDePasseFaible.status).toBe(400);
  });

  it('connecte le spectateur puis donne accès à son profil avec le jeton', async () => {
    const connexion = await request(serveur())
      .post('/auth/connexion')
      .send({ email, motDePasse })
      .expect(200);
    expect(connexion.body.role).toBe('CLIENT');

    const profil = await request(serveur())
      .get('/auth/moi')
      .set('Authorization', `Bearer ${connexion.body.accessToken}`)
      .expect(200);
    expect(profil.body.email).toBe(email);
  });

  it('refuse un mauvais mot de passe (401) et un accès sans jeton (401)', async () => {
    const mauvaisMotDePasse = await request(serveur())
      .post('/auth/connexion')
      .send({ email, motDePasse: 'MauvaisMotDePasse1' });
    const sansJeton = await request(serveur()).get('/auth/moi');
    expect(mauvaisMotDePasse.status).toBe(401);
    expect(sansJeton.status).toBe(401);
  });
});
