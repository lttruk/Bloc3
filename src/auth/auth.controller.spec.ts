import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  const service = {
    inscrire: jest.fn().mockResolvedValue({ id: 7 }),
    connecter: jest.fn().mockResolvedValue({ accessToken: 'jeton', role: 'CLIENT' }),
    profil: jest.fn().mockResolvedValue({ id: 7 }),
  };
  const controleur = new AuthController(service as unknown as AuthService);

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

  it('délègue la connexion au service', async () => {
    const dto = { email: 'camille@exemple.fr', motDePasse: 'MotDePasse2027' };
    await expect(controleur.connecter(dto)).resolves.toEqual({ accessToken: 'jeton', role: 'CLIENT' });
  });

  it('renvoie le profil de l’utilisateur du jeton', async () => {
    await controleur.profil({ id: 7, role: 'CLIENT' });
    expect(service.profil).toHaveBeenCalledWith(7);
  });
});
