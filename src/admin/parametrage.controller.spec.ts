import { ParametrageController } from './parametrage.controller';
import { ParametrageService } from './parametrage.service';

describe('ParametrageController', () => {
  const service = {
    listerTarifs: jest.fn().mockResolvedValue([]),
    creerTarif: jest.fn().mockResolvedValue({}),
    modifierTarif: jest.fn().mockResolvedValue({}),
    lireConfiguration: jest.fn().mockResolvedValue({}),
    configurerSalle: jest.fn().mockResolvedValue({}),
  };
  const controleur = new ParametrageController(service as unknown as ParametrageService);
  const admin = { id: 1, role: 'ADMIN' as const };

  it('transmet l’auteur de chaque modification au service', async () => {
    const config = { rangees: [{ rangee: 'A', places: 10 }] };
    await controleur.listerTarifs();
    await controleur.creerTarif(admin, { libelle: 'Étudiant', prix: 8.5 });
    await controleur.modifierTarif(admin, 4, { actif: false });
    await controleur.lireConfiguration(2);
    await controleur.configurerSalle(admin, 2, config);
    expect(service.creerTarif).toHaveBeenCalledWith(1, { libelle: 'Étudiant', prix: 8.5 });
    expect(service.modifierTarif).toHaveBeenCalledWith(1, 4, { actif: false });
    expect(service.lireConfiguration).toHaveBeenCalledWith(2);
    expect(service.configurerSalle).toHaveBeenCalledWith(1, 2, config);
    expect(service.listerTarifs).toHaveBeenCalled();
  });
});
