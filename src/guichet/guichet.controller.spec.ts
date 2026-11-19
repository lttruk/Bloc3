import { GuichetController } from './guichet.controller';
import { GuichetService } from './guichet.service';

describe('GuichetController', () => {
  const service = {
    seancesEnVente: jest.fn().mockResolvedValue([]),
    vendre: jest.fn().mockResolvedValue({ reference: 'REF' }),
    bilanDuJour: jest.fn().mockResolvedValue({ jour: '2027-01-15', canaux: [] }),
  };
  const controleur = new GuichetController(service as unknown as GuichetService);

  it('vend au nom du caissier connecté et délègue les lectures', async () => {
    const dto = { places: [{ placeId: 1, tarifId: 1 }], modePaiement: 'ESPECES' as const };
    await controleur.vendre({ id: 8, role: 'CAISSIER' }, 3, dto);
    await controleur.seances();
    await controleur.bilan();
    expect(service.vendre).toHaveBeenCalledWith(8, 3, dto);
    expect(service.seancesEnVente).toHaveBeenCalled();
    expect(service.bilanDuJour).toHaveBeenCalled();
  });
});
