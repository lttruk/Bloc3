import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configurerApplication } from '../src/configuration-app';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Vente au guichet – US-7.3 (e2e, base MySQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const jetons: Partial<Record<Role, string>> = {};
  let seanceId: number;
  let placeWeb: number;
  let placeGuichet: number;
  let tarifId: number;

  const http = () => request(app.getHttpServer());
  const en = (role: Role) => `Bearer ${jetons[role]}`;

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

    const salle = await prisma.salle.create({ data: { nom: 'Salle guichet', capacite: 2 } });
    placeWeb = (await prisma.place.create({ data: { salleId: salle.id, rangee: 'A', numero: 1 } }))
      .id;
    placeGuichet = (
      await prisma.place.create({ data: { salleId: salle.id, rangee: 'A', numero: 2 } })
    ).id;
    const film = await prisma.film.create({
      data: { titre: 'Film du guichet', dureeMinutes: 90, statut: 'PUBLIE' },
    });
    const debut = new Date(Date.now() + 2 * 3600 * 1000);
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
    tarifId = (await prisma.tarif.create({ data: { libelle: 'Plein', prix: 11.5 } })).id;
    for (const role of ['CLIENT', 'CAISSIER', 'CONTROLEUR'] as Role[]) {
      const u = await prisma.utilisateur.create({
        data: {
          nom: 'Test',
          prenom: role,
          email: `${role.toLowerCase()}@guichet.test`,
          motDePasseHash: 'x',
          consentementRgpdLe: new Date(),
          role,
        },
      });
      jetons[role] = jwt.sign({ sub: u.id, role });
    }
  });

  afterAll(() => app.close());

  it('réserve le guichet aux caissiers', async () => {
    await http().get('/guichet/seances').expect(401);
    await http().get('/guichet/seances').set('Authorization', en('CLIENT')).expect(403);
    const reponse = await http()
      .get('/guichet/seances')
      .set('Authorization', en('CAISSIER'))
      .expect(200);
    expect(reponse.body.find((s: { id: number }) => s.id === seanceId)).toMatchObject({
      placesLibres: 2,
    });
  });

  it('refuse au guichet une place bloquée en ligne', async () => {
    await http()
      .post(`/seances/${seanceId}/reservations`)
      .set('Authorization', en('CLIENT'))
      .send({ places: [{ placeId: placeWeb, tarifId }] })
      .expect(201);
    await http()
      .post(`/guichet/seances/${seanceId}/ventes`)
      .set('Authorization', en('CAISSIER'))
      .send({ places: [{ placeId: placeWeb, tarifId }], modePaiement: 'ESPECES' })
      .expect(409);
  });

  it('vend une place libre, émet le billet, puis la rend indisponible en ligne', async () => {
    const vente = await http()
      .post(`/guichet/seances/${seanceId}/ventes`)
      .set('Authorization', en('CAISSIER'))
      .send({ places: [{ placeId: placeGuichet, tarifId }], modePaiement: 'CARTE' })
      .expect(201);
    expect(vente.body).toMatchObject({ total: 11.5, modePaiement: 'CARTE' });
    expect(vente.body.billets[0]).toMatchObject({ place: 'A2', titulaire: 'Vente au guichet' });
    expect(vente.body.billets[0].qrSvg).toContain('<svg');

    await http()
      .post(`/seances/${seanceId}/reservations`)
      .set('Authorization', en('CLIENT'))
      .send({ places: [{ placeId: placeGuichet, tarifId }] })
      .expect(409);

    // Le billet du guichet se contrôle comme un billet vendu en ligne
    const scan = await http()
      .post('/controle/scan')
      .set('Authorization', en('CONTROLEUR'))
      .send({ code: vente.body.billets[0].codeQr, seanceId })
      .expect(200);
    expect(scan.body).toMatchObject({ valide: true, billet: { titulaire: 'Vente au guichet' } });
  });

  it('compte la vente dans le bilan du jour, canal guichet', async () => {
    const bilan = await http()
      .get('/guichet/bilan')
      .set('Authorization', en('CAISSIER'))
      .expect(200);
    expect(bilan.body.canaux).toContainEqual({ canal: 'GUICHET', billets: 1, montant: 11.5 });
  });

  it('n’affiche pas les ventes du guichet dans « Mes réservations » du caissier', async () => {
    const mes = await http()
      .get('/reservations/moi')
      .set('Authorization', en('CAISSIER'))
      .expect(200);
    expect(mes.body).toHaveLength(0);
  });
});
