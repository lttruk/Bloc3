import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configurerApplication } from '../src/configuration-app';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Back-office de programmation – US-7.1 (e2e, base MySQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const jetons: Partial<Record<Role, string>> = {};
  let salleId: number;
  let filmId: number;

  // Demain, à l'heure UTC indiquée
  const demain = (heureUtc: number, minute = 0) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(heureUtc, minute, 0, 0);
    return d.toISOString();
  };
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

    salleId = (await prisma.salle.create({ data: { nom: 'Salle admin', capacite: 1 } })).id;
    await prisma.place.create({ data: { salleId, rangee: 'A', numero: 1 } });
    for (const role of ['CLIENT', 'PROGRAMMATION', 'ADMIN'] as Role[]) {
      const u = await prisma.utilisateur.create({
        data: {
          nom: 'Test',
          prenom: role,
          email: `${role.toLowerCase()}@admin.test`,
          motDePasseHash: 'non-utilise-dans-ces-tests',
          consentementRgpdLe: new Date(),
          role,
        },
      });
      jetons[role] = jwt.sign({ sub: u.id, role });
    }
  });

  afterAll(() => app.close());

  it('refuse l’accès sans authentification (401) et aux spectateurs (403)', async () => {
    await http().get('/admin/films').expect(401);
    await http().get('/admin/films').set('Authorization', en('CLIENT')).expect(403);
    await http()
      .post('/admin/films')
      .set('Authorization', en('CLIENT'))
      .send({ titre: 'X', dureeMinutes: 90 })
      .expect(403);
  });

  it('crée un film en brouillon puis le publie (rôle programmation)', async () => {
    const cree = await http()
      .post('/admin/films')
      .set('Authorization', en('PROGRAMMATION'))
      .send({ titre: 'Film du back-office', dureeMinutes: 105, genre: 'Drame' })
      .expect(201);
    expect(cree.body.statut).toBe('BROUILLON');
    filmId = cree.body.id;

    const publie = await http()
      .patch(`/admin/films/${filmId}/statut`)
      .set('Authorization', en('ADMIN'))
      .send({ statut: 'PUBLIE' })
      .expect(200);
    expect(publie.body.statut).toBe('PUBLIE');
  });

  it('valide les données envoyées', async () => {
    await http()
      .post('/admin/films')
      .set('Authorization', en('PROGRAMMATION'))
      .send({ titre: '', dureeMinutes: -5 })
      .expect(400);
  });

  it('programme une séance, refuse un chevauchement puis la publie', async () => {
    const seance = await http()
      .post('/admin/seances')
      .set('Authorization', en('PROGRAMMATION'))
      .send({ filmId, salleId, debut: demain(19), version: 'VO' })
      .expect(201);
    expect(seance.body.statut).toBe('PROGRAMMEE');

    // 105 min + 15 min de nettoyage : la salle est occupée jusqu'à 21h00 UTC
    const refus = await http()
      .post('/admin/seances')
      .set('Authorization', en('PROGRAMMATION'))
      .send({ filmId, salleId, debut: demain(20, 50) })
      .expect(409);
    expect(refus.body.message).toContain('Film du back-office');

    await http()
      .post('/admin/seances')
      .set('Authorization', en('PROGRAMMATION'))
      .send({ filmId, salleId, debut: demain(21) })
      .expect(201);

    await http()
      .patch(`/admin/seances/${seance.body.id}/statut`)
      .set('Authorization', en('PROGRAMMATION'))
      .send({ statut: 'PUBLIEE' })
      .expect(200);

    // La séance publiée apparaît dans le programme public
    const programme = await http().get('/seances').expect(200);
    expect(programme.body.map((s: { id: number }) => s.id)).toContain(seance.body.id);
  });

  it('refuse de supprimer une séance réservée et passe par l’annulation', async () => {
    const seance = await prisma.seance.findFirstOrThrow({ where: { statut: 'PUBLIEE' } });
    const client = await prisma.utilisateur.findFirstOrThrow({ where: { role: 'CLIENT' } });
    const place = await prisma.place.findFirstOrThrow({ where: { salleId } });
    const tarif = await prisma.tarif.create({ data: { libelle: 'Plein', prix: 11.5 } });
    await prisma.reservation.create({
      data: {
        utilisateurId: client.id,
        seanceId: seance.id,
        reference: 'ADMINE2E0001',
        statut: 'CONFIRMEE',
        billets: {
          create: { seanceId: seance.id, placeId: place.id, tarifId: tarif.id, prixApplique: 11.5 },
        },
      },
    });

    await http()
      .delete(`/admin/seances/${seance.id}`)
      .set('Authorization', en('PROGRAMMATION'))
      .expect(409);

    const annulation = await http()
      .post(`/admin/seances/${seance.id}/annulation`)
      .set('Authorization', en('PROGRAMMATION'))
      .expect(200);
    expect(annulation.body).toEqual({ reservationsAnnulees: 1, remboursementsATraiter: 1 });
    expect((await prisma.billet.findFirstOrThrow({ where: { seanceId: seance.id } })).statut).toBe(
      'ANNULE',
    );
  });

  it('journalise les modifications (qui, quoi, quand)', async () => {
    const journal = await http()
      .get('/admin/journal')
      .set('Authorization', en('ADMIN'))
      .expect(200);
    const actions = journal.body.map(
      (e: { action: string; entite: string }) => `${e.entite}:${e.action}`,
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        'FILM:CREATION',
        'FILM:STATUT',
        'SEANCE:CREATION',
        'SEANCE:ANNULATION',
      ]),
    );
    expect(journal.body[0].auteur).toBeDefined();
  });
});
