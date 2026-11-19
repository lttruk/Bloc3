import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PaiementsController } from './paiements.controller';
import { PaiementsService } from './paiements.service';

describe('PaiementsController', () => {
  const service = {
    initier: jest.fn().mockResolvedValue({ url: 'https://checkout' }),
    verifierRetour: jest
      .fn()
      .mockResolvedValue({ reference: 'REF', statut: 'CONFIRMEE', paye: true }),
    traiterNotification: jest.fn().mockResolvedValue(undefined),
  };
  const spectateur = { id: 4, role: 'CLIENT' as const };
  const requete = (origine?: string) => ({ get: () => origine }) as unknown as Request;
  const controleur = (appUrl?: string) =>
    new PaiementsController(
      service as unknown as PaiementsService,
      { get: () => appUrl } as unknown as ConfigService,
    );

  beforeEach(() => jest.clearAllMocks());

  it('utilise APP_URL comme adresse de retour quand elle est configurée', async () => {
    await controleur('https://cinema.up.railway.app/').initier(
      spectateur,
      'REF',
      requete('http://autre'),
    );
    expect(service.initier).toHaveBeenCalledWith(4, 'REF', 'https://cinema.up.railway.app');
  });

  it('se rabat sur l’origine de la requête, puis sur localhost', async () => {
    await controleur().initier(spectateur, 'REF', requete('http://localhost:3000'));
    await controleur().initier(spectateur, 'REF', requete());
    expect(service.initier).toHaveBeenNthCalledWith(1, 4, 'REF', 'http://localhost:3000');
    expect(service.initier).toHaveBeenNthCalledWith(2, 4, 'REF', 'http://localhost:3000');
  });

  it('vérifie le retour au nom de l’utilisateur du jeton', async () => {
    await controleur().verifier(spectateur, { sessionId: 'cs_test_1' });
    expect(service.verifierRetour).toHaveBeenCalledWith(4, 'cs_test_1');
  });

  it('transmet le corps brut et la signature de la notification', async () => {
    const corps = Buffer.from('{}');
    const reponse = await controleur().notification({ rawBody: corps } as never, 't=1,v1=x');
    expect(service.traiterNotification).toHaveBeenCalledWith(corps, 't=1,v1=x');
    expect(reponse).toEqual({ recu: true });
  });
});
