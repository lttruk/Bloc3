import { ConflictException, HttpException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, DUREE_BLOCAGE_MS, MAX_ECHECS_CONNEXION } from './auth.service';
import { SessionsService } from './sessions.service';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('empreinte'),
  verify: jest.fn(),
}));

describe('AuthService', () => {
  const inscription = {
    nom: ' Durand ',
    prenom: 'Camille',
    email: 'camille@exemple.fr',
    motDePasse: 'MotDePasse2027',
    consentementRgpd: true,
  };
  const publicCamille = {
    id: 7,
    nom: 'Durand',
    prenom: 'Camille',
    email: 'camille@exemple.fr',
    role: 'CLIENT',
  };
  let prisma: any;
  let sessions: any;
  let service: AuthService;
  const session = { jeton: { accessToken: 'jeton', role: 'CLIENT' }, rafraichissement: 'brut' };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      utilisateur: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({ echecsConnexion: 1 }),
      },
      journalConnexion: { create: jest.fn() },
    };
    sessions = { ouvrir: jest.fn().mockResolvedValue(session) };
    service = new AuthService(prisma as PrismaService, sessions as unknown as SessionsService);
  });

  describe('inscrire', () => {
    it('crée un compte CLIENT avec un mot de passe haché et la date de consentement', async () => {
      prisma.utilisateur.create.mockResolvedValue(publicCamille);

      const resultat = await service.inscrire(inscription);

      const { data, select } = prisma.utilisateur.create.mock.calls[0][0];
      expect(argon2.hash).toHaveBeenCalledWith('MotDePasse2027');
      expect(data).toMatchObject({
        nom: 'Durand',
        email: 'camille@exemple.fr',
        motDePasseHash: 'empreinte',
        role: 'CLIENT',
      });
      expect(data.consentementRgpdLe).toBeInstanceOf(Date);
      expect(select.motDePasseHash).toBeUndefined();
      expect(resultat).toEqual(publicCamille);
    });

    it('renvoie 409 si l’e-mail est déjà utilisé', async () => {
      prisma.utilisateur.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('doublon', { code: 'P2002', clientVersion: 'test' }),
      );
      await expect(service.inscrire(inscription)).rejects.toBeInstanceOf(ConflictException);
    });

    it('laisse remonter les autres erreurs', async () => {
      prisma.utilisateur.create.mockRejectedValue(new Error('base indisponible'));
      await expect(service.inscrire(inscription)).rejects.toThrow('base indisponible');
    });
  });

  describe('connecter', () => {
    const connexion = { email: 'camille@exemple.fr', motDePasse: 'MotDePasse2027' };
    const camille = { id: 7, role: 'CLIENT', motDePasseHash: 'h', bloqueJusquA: null };
    const journal = () => prisma.journalConnexion.create.mock.calls.map((c: any) => c[0].data);

    it('ouvre une session, remet les échecs à zéro et journalise le succès avec l’IP tronquée', async () => {
      prisma.utilisateur.findUnique.mockResolvedValue(camille);
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      const resultat = await service.connecter(connexion, '203.0.113.57');

      expect(argon2.verify).toHaveBeenCalledWith('h', 'MotDePasse2027');
      expect(prisma.utilisateur.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { echecsConnexion: 0, bloqueJusquA: null },
      });
      expect(journal()).toEqual([
        { utilisateurId: 7, resultat: 'SUCCES', ipTronquee: '203.0.113.0' },
      ]);
      expect(sessions.ouvrir).toHaveBeenCalledWith(7, 'CLIENT');
      expect(resultat).toBe(session);
    });

    it('refuse un mot de passe incorrect, compte l’échec et le journalise', async () => {
      prisma.utilisateur.findUnique.mockResolvedValue(camille);
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(service.connecter(connexion)).rejects.toBeInstanceOf(UnauthorizedException);

      expect(prisma.utilisateur.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { echecsConnexion: { increment: 1 } },
        select: { echecsConnexion: true },
      });
      expect(journal()).toEqual([{ utilisateurId: 7, resultat: 'ECHEC', ipTronquee: null }]);
      expect(sessions.ouvrir).not.toHaveBeenCalled();
    });

    it('bloque le compte 15 minutes au 5e échec consécutif (429)', async () => {
      prisma.utilisateur.findUnique.mockResolvedValue(camille);
      prisma.utilisateur.update.mockResolvedValue({ echecsConnexion: MAX_ECHECS_CONNEXION });
      (argon2.verify as jest.Mock).mockResolvedValue(false);
      const avant = Date.now();

      const erreur = await service.connecter(connexion).catch((e: unknown) => e);

      expect(erreur).toBeInstanceOf(HttpException);
      expect((erreur as HttpException).getStatus()).toBe(429);
      const { data } = prisma.utilisateur.update.mock.calls[1][0];
      expect(data.echecsConnexion).toBe(0);
      expect(data.bloqueJusquA.getTime()).toBeGreaterThanOrEqual(avant + DUREE_BLOCAGE_MS);
    });

    it('refuse même le bon mot de passe tant que le compte est bloqué', async () => {
      prisma.utilisateur.findUnique.mockResolvedValue({
        ...camille,
        bloqueJusquA: new Date(Date.now() + 5 * 60_000),
      });

      await expect(service.connecter(connexion)).rejects.toThrow('Réessayez dans 5 min');

      expect(argon2.verify).not.toHaveBeenCalled();
      expect(journal()).toEqual([{ utilisateurId: 7, resultat: 'BLOQUE', ipTronquee: null }]);
    });

    it('accepte de nouveau la connexion une fois le blocage expiré', async () => {
      prisma.utilisateur.findUnique.mockResolvedValue({
        ...camille,
        bloqueJusquA: new Date(Date.now() - 1000),
      });
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      await expect(service.connecter(connexion)).resolves.toBe(session);
    });

    it('refuse un e-mail inconnu en vérifiant quand même une empreinte factice', async () => {
      prisma.utilisateur.findUnique.mockResolvedValue(null);
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(service.connecter(connexion)).rejects.toThrow('E-mail ou mot de passe incorrect.');
      expect(argon2.verify).toHaveBeenCalledWith('empreinte', 'MotDePasse2027');
      expect(journal()).toEqual([{ utilisateurId: null, resultat: 'ECHEC', ipTronquee: null }]);
    });
  });

  describe('profil', () => {
    it('renvoie les informations publiques de l’utilisateur', async () => {
      prisma.utilisateur.findUnique.mockResolvedValue(publicCamille);
      await expect(service.profil(7)).resolves.toEqual(publicCamille);
    });

    it('renvoie 401 si le compte n’existe plus', async () => {
      prisma.utilisateur.findUnique.mockResolvedValue(null);
      await expect(service.profil(7)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
