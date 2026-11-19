import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CodeQrService } from '../src/billets/code-qr.service';
import { configurerApplication } from '../src/configuration-app';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Billet QR et contrôle en salle – US-5.1 / US-6.1 (e2e, base MySQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jetonClient: string;
  let jetonControleur: string;
  let seanceId: number;
  let code: string;

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

    const salle = await prisma.salle.create({ data: { nom: 'Salle contrôle', capacite: 1 } });
    const place = await prisma.place.create({
      data: { salleId: salle.id, rangee: 'B', numero: 4 },
    });
    const film = await prisma.film.create({
      data: { titre: 'Film contrôlé', dureeMinutes: 90, statut: 'PUBLIE' },
    });
    const debut = new Date(Date.now() + 30 * 60_000);
    seanceId = (
      await prisma.seance.create({
        data: {
          filmId: film.id,
          salleId: salle.id,
          debut,
          fin: new Date(debut.getTime() + 105 * 60_000),
          statut: 'PUBLIEE',
        },
      })
    ).id;
    const tarif = await prisma.tarif.create({
      data: { libelle: 'Réduit', prix: 9, justificatifRequis: true },
    });
    const creer = (role: 'CLIENT' | 'CONTROLEUR', email: string) =>
      prisma.utilisateur.create({
        data: {
          nom: 'Test',
          prenom: role,
          email,
          role,
          motDePasseHash: 'x',
          consentementRgpdLe: new Date(),
        },
      });
    const client = await creer('CLIENT', 'client@controle.test');
    const controleur = await creer('CONTROLEUR', 'controleur@controle.test');
    jetonClient = jwt.sign({ sub: client.id, role: client.role });
    jetonControleur = jwt.sign({ sub: controleur.id, role: controleur.role });

    const reservation = await prisma.reservation.create({
      data: {
        utilisateurId: client.id,
        seanceId,
        reference: 'CONTROLEE2E1',
        statut: 'CONFIRMEE',
        billets: { create: { seanceId, placeId: place.id, tarifId: tarif.id, prixApplique: 9 } },
      },
      include: { billets: true },
    });
    const billet = reservation.billets[0];
    code = app.get(CodeQrService).signer(billet.id, seanceId);
    await prisma.billet.update({ where: { id: billet.id }, data: { codeQr: code } });
  });

  afterAll(() => app.close());

  it('fournit au spectateur son billet avec un QR code SVG', async () => {
    const reponse = await http()
      .get('/reservations/CONTROLEE2E1/billets')
      .set('Authorization', `Bearer ${jetonClient}`)
      .expect(200);
    expect(reponse.body).toHaveLength(1);
    expect(reponse.body[0]).toMatchObject({ place: 'B4', tarif: 'Réduit', codeQr: code });
    expect(reponse.body[0].qrSvg).toContain('<svg');
  });

  it('réserve le contrôle aux contrôleurs', async () => {
    await http().post('/controle/scan').send({ code }).expect(401);
    await http()
      .post('/controle/scan')
      .set('Authorization', `Bearer ${jetonClient}`)
      .send({ code })
      .expect(403);
  });

  it('propose la séance du moment au contrôleur', async () => {
    const reponse = await http()
      .get('/controle/seances')
      .set('Authorization', `Bearer ${jetonControleur}`)
      .expect(200);
    expect(reponse.body.map((s: { id: number }) => s.id)).toContain(seanceId);
  });

  it('refuse un code falsifié', async () => {
    const falsifie = code.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
    const reponse = await http()
      .post('/controle/scan')
      .set('Authorization', `Bearer ${jetonControleur}`)
      .send({ code: falsifie, seanceId })
      .expect(200);
    expect(reponse.body).toMatchObject({ valide: false, motif: 'FALSIFIE' });
  });

  it('valide le billet une fois, puis signale qu’il est déjà utilisé', async () => {
    const premier = await http()
      .post('/controle/scan')
      .set('Authorization', `Bearer ${jetonControleur}`)
      .send({ code, seanceId })
      .expect(200);
    expect(premier.body.valide).toBe(true);
    expect(premier.body.billet).toMatchObject({ place: 'B4', justificatif: 'Réduit' });

    const second = await http()
      .post('/controle/scan')
      .set('Authorization', `Bearer ${jetonControleur}`)
      .send({ code, seanceId })
      .expect(200);
    expect(second.body).toMatchObject({ valide: false, motif: 'DEJA_UTILISE' });
    expect(second.body.message).toMatch(/^Billet déjà utilisé à \d{2}:\d{2}$/);
  });
});
