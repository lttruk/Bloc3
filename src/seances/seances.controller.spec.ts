import { SeancesController } from './seances.controller';
import { SeancesService } from './seances.service';

describe('SeancesController', () => {
  const service = {
    lister: jest.fn().mockResolvedValue([{ id: 1 }]),
    planDeSalle: jest.fn().mockResolvedValue({ places: [] }),
  };
  const controleur = new SeancesController(service as unknown as SeancesService);

  it('transmet les filtres du programme au service', async () => {
    await expect(controleur.lister({ version: 'VF' })).resolves.toEqual([{ id: 1 }]);
    expect(service.lister).toHaveBeenCalledWith({ version: 'VF' });
  });

  it('renvoie le plan de salle de la séance demandée', async () => {
    await controleur.planDeSalle(5);
    expect(service.planDeSalle).toHaveBeenCalledWith(5);
  });
});
