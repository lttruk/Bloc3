import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { COOKIE_SESSION } from '../src/auth/cookie-session';
import { configurerApplication } from '../src/configuration-app';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Connexion sécurisée – US-2.2 (e2e, base MySQL)', () => {
  const email = 'connexion@e2e.test';
  const motDePasse = 'MotDePasse2027';
  let app: INestApplication;
  let prisma: PrismaService;
  let utilisateurId: number;

  const http = () => request(app.getHttpServer());
  const connecter = (mdp = motDePasse) =>
    http().post('/auth/connexion').send({ email, motDePasse: mdp });
  /** Cookie de session renvoyé par une réponse, au format « nom=valeur ». */
  const cookieDe = (reponse: request.Response): string => {
    const entetes = ([] as string[]).concat(reponse.headers['set-cookie'] ?? []);
    const cookie = entetes.find((c) => c.startsWith(`${COOKIE_SESSION}=`));
    if (!cookie) throw new Error('Cookie de session absent');
    return cookie.split(';')[0];
  };
  const journal = () =>
    prisma.journalConnexion.findMany({ where: { utilisateurId }, orderBy: { id: 'asc' } });

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

    await prisma.journalAdmin.deleteMany();
    await prisma.utilisateur.deleteMany({ where: { email } });
    const utilisateur = await prisma.utilisateur.create({
      data: {
        nom: 'E2E',
        prenom: 'Connexion',
        email,
        motDePasseHash: await argon2.hash(motDePasse),
        consentementRgpdLe: new Date(),
      },
    });
    utilisateurId = utilisateur.id;
  });

  afterAll(async () => {
    await prisma.utilisateur.deleteMany({ where: { email } });
    await app.close();
  });

  it('pose un cookie de session httpOnly et journalise la connexion avec une IP tronquée', async () => {
    const reponse = await connecter().expect(200);
    expect(reponse.body.accessToken).toEqual(expect.any(String));
    const entete = ([] as string[]).concat(reponse.headers['set-cookie'] ?? []).join(';');
    expect(entete).toContain('HttpOnly');
    expect(entete).toContain('Secure');
    expect(entete).toContain('SameSite=Strict');
    expect(entete).toContain('Path=/auth');

    const lignes = await journal();
    expect(lignes.at(-1)).toMatchObject({ resultat: 'SUCCES' });
    expect(lignes.at(-1)?.ipTronquee).toMatch(/^(127\.0\.0\.0|0:0:0::)$/);
  });

  it('renouvelle le jeton d’accès avec le cookie, une seule fois par jeton', async () => {
    const ancien = cookieDe(await connecter().expect(200));

    const renouvellement = await http().post('/auth/rafraichir').set('Cookie', ancien).expect(200);
    const nouveau = cookieDe(renouvellement);
    expect(nouveau).not.toBe(ancien);
    await http()
      .get('/auth/moi')
      .set('Authorization', `Bearer ${renouvellement.body.accessToken}`)
      .expect(200);

    // L'ancien jeton a été remplacé : il ne peut plus servir.
    await http().post('/auth/rafraichir').set('Cookie', ancien).expect(401);
    await http().post('/auth/rafraichir').expect(401);

    // La déconnexion révoque le jeton courant.
    await http().post('/auth/deconnexion').set('Cookie', nouveau).expect(204);
    await http().post('/auth/rafraichir').set('Cookie', nouveau).expect(401);
  });

  it('bloque le compte 15 minutes après 5 échecs consécutifs, même avec le bon mot de passe', async () => {
    for (let i = 1; i < 5; i++) await connecter('MauvaisMotDePasse1').expect(401);
    const cinquieme = await connecter('MauvaisMotDePasse1').expect(429);
    expect(cinquieme.body.message).toContain('bloqué');
    await connecter().expect(429);

    const compte = await prisma.utilisateur.findUniqueOrThrow({ where: { id: utilisateurId } });
    expect(compte.bloqueJusquA!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    const resultats = (await journal()).map((l) => l.resultat);
    expect(resultats.slice(-6)).toEqual(['ECHEC', 'ECHEC', 'ECHEC', 'ECHEC', 'ECHEC', 'BLOQUE']);

    // Fin du blocage : la connexion est de nouveau acceptée et le compteur repart de zéro.
    await prisma.utilisateur.update({
      where: { id: utilisateurId },
      data: { bloqueJusquA: new Date(Date.now() - 1000) },
    });
    await connecter().expect(200);
    const apres = await prisma.utilisateur.findUniqueOrThrow({ where: { id: utilisateurId } });
    expect(apres).toMatchObject({ echecsConnexion: 0, bloqueJusquA: null });
  });
});
