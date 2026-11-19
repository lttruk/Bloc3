import { UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { COOKIE_SESSION } from './cookie-session';
import { SessionsService } from './sessions.service';

describe('AuthController', () => {
  const expireLe = new Date('2027-04-03T10:00:00Z');
  const session = {
    jeton: { accessToken: 'jeton', role: 'CLIENT' },
    rafraichissement: 'brut',
    expireLe,
  };
  let service: any;
  let sessions: any;
  let res: any;
  let controleur: AuthController;
  const requete = (cookie?: string) =>
    ({ ip: '203.0.113.57', headers: cookie ? { cookie } : {} }) as unknown as Request;

  beforeEach(() => {
    service = {
      inscrire: jest.fn().mockResolvedValue({ id: 7 }),
      connecter: jest.fn().mockResolvedValue(session),
      profil: jest.fn().mockResolvedValue({ id: 7 }),
    };
    sessions = {
      renouveler: jest.fn().mockResolvedValue(session),
      fermer: jest.fn().mockResolvedValue(undefined),
    };
    res = { cookie: jest.fn(), clearCookie: jest.fn() };
    controleur = new AuthController(
      service as unknown as AuthService,
      sessions as unknown as SessionsService,
    );
  });

  it('délègue l’inscription au service', async () => {
    const dto = {
      nom: 'Durand',
      prenom: 'Camille',
      email: 'camille@exemple.fr',
      motDePasse: 'MotDePasse2027',
      consentementRgpd: true,
    };
    await expect(controleur.inscrire(dto)).resolves.toEqual({ id: 7 });
    expect(service.inscrire).toHaveBeenCalledWith(dto);
  });

  it('connecte avec l’IP du client et pose le jeton de rafraîchissement en cookie httpOnly', async () => {
    const dto = { email: 'camille@exemple.fr', motDePasse: 'MotDePasse2027' };
    await expect(controleur.connecter(dto, requete(), res as Response)).resolves.toEqual(
      session.jeton,
    );
    expect(service.connecter).toHaveBeenCalledWith(dto, '203.0.113.57');
    expect(res.cookie).toHaveBeenCalledWith(
      COOKIE_SESSION,
      'brut',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        expires: expireLe,
      }),
    );
  });

  it('renouvelle la session à partir du cookie', async () => {
    await controleur.rafraichir(requete(`autre=1; ${COOKIE_SESSION}=ancien`), res as Response);
    expect(sessions.renouveler).toHaveBeenCalledWith('ancien');
    expect(res.cookie).toHaveBeenCalledWith(COOKIE_SESSION, 'brut', expect.any(Object));
  });

  it('efface le cookie quand le renouvellement est refusé', async () => {
    sessions.renouveler.mockRejectedValue(new UnauthorizedException());
    await expect(controleur.rafraichir(requete(), res as Response)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(sessions.renouveler).toHaveBeenCalledWith(undefined);
    expect(res.clearCookie).toHaveBeenCalledWith(COOKIE_SESSION, expect.any(Object));
  });

  it('révoque le jeton et efface le cookie à la déconnexion', async () => {
    await controleur.deconnecter(requete(`${COOKIE_SESSION}=ancien`), res as Response);
    expect(sessions.fermer).toHaveBeenCalledWith('ancien');
    expect(res.clearCookie).toHaveBeenCalled();
  });

  it('renvoie le profil de l’utilisateur du jeton', async () => {
    await controleur.profil({ id: 7, role: 'CLIENT' });
    expect(service.profil).toHaveBeenCalledWith(7);
  });
});
