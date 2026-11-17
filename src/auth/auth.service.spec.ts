import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

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
  let jwt: any;
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = { utilisateur: { create: jest.fn(), findUnique: jest.fn() } };
    jwt = { signAsync: jest.fn().mockResolvedValue('jeton') };
    service = new AuthService(prisma as PrismaService, jwt as JwtService);
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

    it('renvoie un jeton signé avec l’identifiant et le rôle', async () => {
      prisma.utilisateur.findUnique.mockResolvedValue({ id: 7, role: 'CLIENT', motDePasseHash: 'h' });
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      const resultat = await service.connecter(connexion);

      expect(argon2.verify).toHaveBeenCalledWith('h', 'MotDePasse2027');
      expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 7, role: 'CLIENT' });
      expect(resultat).toEqual({ accessToken: 'jeton', role: 'CLIENT' });
    });

    it('refuse un mot de passe incorrect', async () => {
      prisma.utilisateur.findUnique.mockResolvedValue({ id: 7, role: 'CLIENT', motDePasseHash: 'h' });
      (argon2.verify as jest.Mock).mockResolvedValue(false);
      await expect(service.connecter(connexion)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it('refuse un e-mail inconnu en vérifiant quand même une empreinte factice', async () => {
      prisma.utilisateur.findUnique.mockResolvedValue(null);
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(service.connecter(connexion)).rejects.toThrow('E-mail ou mot de passe incorrect.');
      expect(argon2.verify).toHaveBeenCalledWith('empreinte', 'MotDePasse2027');
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
