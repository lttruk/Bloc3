import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { finDeSeance, NETTOYAGE_MINUTES, ProgrammationService } from './programmation.service';

const MAINTENANT = new Date('2027-03-27T10:00:00Z');
const DEMAIN_20H = '2027-03-28T19:00:00.000Z';

function erreurPrisma(code: string) {
  return new Prisma.PrismaClientKnownRequestError('Erreur simulée', {
    code,
    clientVersion: 'test',
  });
}

const filmPublie = { id: 1, titre: 'Hors Ligne', dureeMinutes: 105, statut: 'PUBLIE' };

function seanceLue(surcharges: Record<string, unknown> = {}) {
  return {
    id: 7,
    debut: new Date(DEMAIN_20H),
    fin: finDeSeance(new Date(DEMAIN_20H), 105),
    version: 'VF',
    festival: false,
    ouvertureVente: null,
    statut: 'PROGRAMMEE',
    film: { id: 1, titre: 'Hors Ligne', dureeMinutes: 105 },
    salle: { id: 1, nom: 'Salle 1' },
    _count: { billets: 0 },
    ...surcharges,
  };
}

describe('ProgrammationService', () => {
  let prisma: any;
  let service: ProgrammationService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(MAINTENANT);
    prisma = {
      film: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      salle: { findUnique: jest.fn().mockResolvedValue({ id: 1 }), findMany: jest.fn() },
      seance: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      reservation: {
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      billet: { updateMany: jest.fn() },
      journalAdmin: { create: jest.fn(), findMany: jest.fn() },
    };
    prisma.$transaction = jest.fn((travail: (tx: unknown) => unknown) => travail(prisma));
    service = new ProgrammationService(prisma as PrismaService);
  });

  afterEach(() => jest.useRealTimers());

  it('calcule la fin d’une séance avec le temps de nettoyage', () => {
    const fin = finDeSeance(new Date(DEMAIN_20H), 105);
    expect(fin.getTime() - new Date(DEMAIN_20H).getTime()).toBe((105 + NETTOYAGE_MINUTES) * 60_000);
  });

  describe('creerSeance', () => {
    const dto = { filmId: 1, salleId: 1, debut: DEMAIN_20H };

    beforeEach(() => {
      prisma.film.findUnique.mockResolvedValue(filmPublie);
      prisma.seance.create.mockResolvedValue(seanceLue());
    });

    it('programme la séance non publiée, calcule sa fin et journalise la création', async () => {
      const resultat = await service.creerSeance(3, dto);
      const { data } = prisma.seance.create.mock.calls[0][0];
      expect(data.statut).toBe('PROGRAMMEE');
      expect(data.fin).toEqual(finDeSeance(new Date(DEMAIN_20H), 105));
      expect(resultat.billetsActifs).toBe(0);
      expect(prisma.journalAdmin.create.mock.calls[0][0].data).toMatchObject({
        utilisateurId: 3,
        action: 'CREATION',
        entite: 'SEANCE',
      });
      // Isolation sérialisable : deux créations simultanées dans la même salle ne passent pas toutes les deux
      expect(prisma.$transaction.mock.calls[0][1].isolationLevel).toBe('Serializable');
    });

    it('cherche un chevauchement dans la même salle, hors séances annulées', async () => {
      await service.creerSeance(3, dto);
      const { where } = prisma.seance.findFirst.mock.calls[0][0];
      expect(where.salleId).toBe(1);
      expect(where.statut).toEqual({ not: 'ANNULEE' });
      expect(where.debut).toEqual({ lt: finDeSeance(new Date(DEMAIN_20H), 105) });
      expect(where.fin).toEqual({ gt: new Date(DEMAIN_20H) });
    });

    it('refuse une séance qui chevauche une séance existante', async () => {
      prisma.seance.findFirst.mockResolvedValue({
        debut: new Date('2027-03-28T18:00:00Z'),
        fin: new Date('2027-03-28T20:00:00Z'),
        film: { titre: 'Zone Blanche' },
      });
      await expect(service.creerSeance(3, dto)).rejects.toThrow(/Zone Blanche/);
      expect(prisma.seance.create).not.toHaveBeenCalled();
    });

    it('refuse une séance dans le passé', async () => {
      await expect(
        service.creerSeance(3, { ...dto, debut: '2027-03-26T19:00:00Z' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('refuse une ouverture de vente postérieure au début', async () => {
      await expect(
        service.creerSeance(3, { ...dto, ouvertureVente: '2027-03-28T21:00:00Z' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('refuse de programmer un film archivé', async () => {
      prisma.film.findUnique.mockResolvedValue({ ...filmPublie, statut: 'ARCHIVE' });
      await expect(service.creerSeance(3, dto)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('renvoie 404 pour une salle inconnue', async () => {
      prisma.salle.findUnique.mockResolvedValue(null);
      await expect(service.creerSeance(3, dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('transforme un conflit de transaction concurrente en 409', async () => {
      prisma.$transaction.mockRejectedValue(erreurPrisma('P2034'));
      await expect(service.creerSeance(3, dto)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('modifierSeance', () => {
    it('refuse de déplacer une séance qui a déjà des billets', async () => {
      prisma.seance.findUnique.mockResolvedValue(seanceLue({ _count: { billets: 2 } }));
      await expect(
        service.modifierSeance(3, 7, { debut: '2027-03-29T19:00:00Z' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.seance.update).not.toHaveBeenCalled();
    });

    it('autorise le changement de version d’une séance réservée, sans contrôle de chevauchement', async () => {
      prisma.seance.findUnique.mockResolvedValue(seanceLue({ _count: { billets: 2 } }));
      prisma.seance.update.mockResolvedValue(seanceLue({ version: 'VO', _count: { billets: 2 } }));
      const resultat = await service.modifierSeance(3, 7, { version: 'VO' });
      expect(resultat.version).toBe('VO');
      expect(prisma.seance.findFirst).not.toHaveBeenCalled();
    });

    it('exclut la séance elle-même du contrôle de chevauchement', async () => {
      prisma.seance.findUnique.mockResolvedValue(seanceLue());
      prisma.seance.update.mockResolvedValue(seanceLue());
      await service.modifierSeance(3, 7, { debut: '2027-03-28T20:00:00Z' });
      expect(prisma.seance.findFirst.mock.calls[0][0].where.id).toEqual({ not: 7 });
    });
  });

  describe('changerStatutSeance', () => {
    it('refuse de publier la séance d’un film non publié', async () => {
      prisma.seance.findUnique.mockResolvedValue(seanceLue());
      prisma.film.findUnique.mockResolvedValue({ ...filmPublie, statut: 'BROUILLON' });
      await expect(service.changerStatutSeance(3, 7, { statut: 'PUBLIEE' })).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('publie la séance d’un film publié', async () => {
      prisma.seance.findUnique.mockResolvedValue(seanceLue());
      prisma.film.findUnique.mockResolvedValue(filmPublie);
      prisma.seance.update.mockResolvedValue(seanceLue({ statut: 'PUBLIEE' }));
      expect((await service.changerStatutSeance(3, 7, { statut: 'PUBLIEE' })).statut).toBe(
        'PUBLIEE',
      );
    });
  });

  describe('annulerSeance et supprimerSeance', () => {
    it('annule billets et réservations et compte les remboursements à traiter', async () => {
      prisma.seance.findUnique.mockResolvedValue(seanceLue({ statut: 'PUBLIEE' }));
      prisma.reservation.count.mockResolvedValue(2);
      prisma.reservation.updateMany.mockResolvedValue({ count: 3 });
      const resultat = await service.annulerSeance(3, 7);
      expect(resultat).toEqual({ reservationsAnnulees: 3, remboursementsATraiter: 2 });
      expect(prisma.billet.updateMany.mock.calls[0][0].data).toEqual({ statut: 'ANNULE' });
      expect(prisma.seance.update.mock.calls[0][0].data).toEqual({ statut: 'ANNULEE' });
    });

    it('refuse d’annuler une séance déjà annulée', async () => {
      prisma.seance.findUnique.mockResolvedValue(seanceLue({ statut: 'ANNULEE' }));
      await expect(service.annulerSeance(3, 7)).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuse de supprimer une séance qui a des réservations', async () => {
      prisma.seance.findUnique.mockResolvedValue(seanceLue());
      prisma.reservation.count.mockResolvedValue(1);
      await expect(service.supprimerSeance(3, 7)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.seance.delete).not.toHaveBeenCalled();
    });

    it('supprime une séance sans réservation et journalise', async () => {
      prisma.seance.findUnique.mockResolvedValue(seanceLue());
      await service.supprimerSeance(3, 7);
      expect(prisma.seance.delete).toHaveBeenCalledWith({ where: { id: 7 } });
      expect(prisma.journalAdmin.create.mock.calls[0][0].data.action).toBe('SUPPRESSION');
    });
  });

  describe('films', () => {
    it('crée un film en brouillon', async () => {
      prisma.film.create.mockResolvedValue({ ...filmPublie, statut: 'BROUILLON' });
      await service.creerFilm(3, { titre: 'Hors Ligne', dureeMinutes: 105 });
      expect(prisma.film.create.mock.calls[0][0].data.statut).toBe('BROUILLON');
    });

    it('refuse d’archiver un film qui a des séances à venir', async () => {
      prisma.film.findUnique.mockResolvedValue(filmPublie);
      prisma.seance.count.mockResolvedValue(4);
      await expect(service.changerStatutFilm(3, 1, { statut: 'ARCHIVE' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('refuse de changer la durée d’un film déjà programmé', async () => {
      prisma.film.findUnique.mockResolvedValue(filmPublie);
      prisma.seance.count.mockResolvedValue(1);
      await expect(service.modifierFilm(3, 1, { dureeMinutes: 120 })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('refuse de supprimer un film déjà programmé', async () => {
      prisma.film.findUnique.mockResolvedValue(filmPublie);
      prisma.seance.count.mockResolvedValue(1);
      await expect(service.supprimerFilm(3, 1)).rejects.toBeInstanceOf(ConflictException);
    });

    it('renvoie 404 pour un film inconnu', async () => {
      prisma.film.findUnique.mockResolvedValue(null);
      await expect(service.modifierFilm(3, 99, { titre: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('lectures', () => {
    it('liste les films avec leur nombre de séances à venir', async () => {
      prisma.film.findMany.mockResolvedValue([{ ...filmPublie, _count: { seances: 2 } }]);
      const [film] = await service.listerFilms();
      expect(film).toEqual({ ...filmPublie, seancesAVenir: 2 });
    });

    it('liste les salles par nom', async () => {
      prisma.salle.findMany.mockResolvedValue([{ id: 1, nom: 'Salle 1', capacite: 120 }]);
      expect(await service.listerSalles()).toHaveLength(1);
      expect(prisma.salle.findMany.mock.calls[0][0].orderBy).toEqual({ nom: 'asc' });
    });

    it('liste par défaut les séances des 7 prochains jours, tous statuts', async () => {
      prisma.seance.findMany.mockResolvedValue([seanceLue({ _count: { billets: 3 } })]);
      const [seance] = await service.listerSeances({});
      const { where } = prisma.seance.findMany.mock.calls[0][0];
      expect(where.debut.gte).toEqual(MAINTENANT);
      expect(where.statut).toBeUndefined();
      expect(seance.billetsActifs).toBe(3);
    });

    it('filtre les séances par salle et refuse une période inversée', async () => {
      prisma.seance.findMany.mockResolvedValue([]);
      await service.listerSeances({ salleId: 2 });
      expect(prisma.seance.findMany.mock.calls[0][0].where.salleId).toBe(2);
      await expect(
        service.listerSeances({ du: '2027-03-29T00:00:00Z', au: '2027-03-28T00:00:00Z' }),
      ).rejects.toThrow();
    });

    it('présente le journal avec le nom de l’auteur', async () => {
      prisma.journalAdmin.findMany.mockResolvedValue([
        {
          id: 1,
          utilisateurId: 3,
          action: 'CREATION',
          entite: 'FILM',
          entiteId: 4,
          details: { titre: 'Swing Night' },
          creeLe: MAINTENANT,
          utilisateur: { prenom: 'Démo', nom: 'Programmation' },
        },
      ]);
      const [entree] = await service.journal();
      expect(entree.auteur).toBe('Démo Programmation');
      expect(entree).not.toHaveProperty('utilisateurId');
    });
  });

  describe('modifications réussies', () => {
    it('modifie un film et journalise les changements', async () => {
      prisma.film.findUnique.mockResolvedValue(filmPublie);
      prisma.film.update.mockResolvedValue({ ...filmPublie, genre: 'Musical' });
      const film = await service.modifierFilm(3, 1, { genre: 'Musical' });
      expect(film.genre).toBe('Musical');
      expect(prisma.journalAdmin.create.mock.calls[0][0].data.details.modifications).toEqual({
        genre: 'Musical',
      });
    });

    it('publie un film', async () => {
      prisma.film.findUnique.mockResolvedValue({ ...filmPublie, statut: 'BROUILLON' });
      prisma.film.update.mockResolvedValue(filmPublie);
      expect((await service.changerStatutFilm(3, 1, { statut: 'PUBLIE' })).statut).toBe('PUBLIE');
    });

    it('supprime un film jamais programmé', async () => {
      prisma.film.findUnique.mockResolvedValue(filmPublie);
      await service.supprimerFilm(3, 1);
      expect(prisma.film.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('change le film d’une séance non réservée et recalcule sa fin', async () => {
      prisma.seance.findUnique.mockResolvedValue(seanceLue());
      prisma.film.findUnique.mockResolvedValue({ ...filmPublie, id: 2, dureeMinutes: 90 });
      prisma.seance.update.mockResolvedValue(seanceLue());
      await service.modifierSeance(3, 7, { filmId: 2 });
      expect(prisma.seance.update.mock.calls[0][0].data.fin).toEqual(
        finDeSeance(new Date(DEMAIN_20H), 90),
      );
    });

    it('refuse de remplacer le film d’une séance par un film archivé', async () => {
      prisma.seance.findUnique.mockResolvedValue(seanceLue());
      prisma.film.findUnique.mockResolvedValue({ ...filmPublie, id: 2, statut: 'ARCHIVE' });
      await expect(service.modifierSeance(3, 7, { filmId: 2 })).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('refuse de modifier ou d’annuler une séance passée ou annulée', async () => {
      prisma.seance.findUnique.mockResolvedValue(seanceLue({ statut: 'ANNULEE' }));
      await expect(service.modifierSeance(3, 7, { version: 'VO' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(service.changerStatutSeance(3, 7, { statut: 'PUBLIEE' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      prisma.seance.findUnique.mockResolvedValue(
        seanceLue({ debut: new Date('2027-03-27T09:00:00Z') }),
      );
      await expect(service.annulerSeance(3, 7)).rejects.toBeInstanceOf(ConflictException);
    });

    it('laisse passer les autres erreurs de transaction', async () => {
      prisma.$transaction.mockRejectedValue(new Error('panne'));
      await expect(
        service.creerSeance(3, { filmId: 1, salleId: 1, debut: DEMAIN_20H }),
      ).rejects.toThrow('panne');
    });
  });
});
