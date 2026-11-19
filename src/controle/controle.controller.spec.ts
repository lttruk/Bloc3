import { ControleController } from './controle.controller';
import { ControleService } from './controle.service';

describe('ControleController', () => {
  const service = {
    seancesDuMoment: jest.fn().mockResolvedValue([]),
    scanner: jest.fn().mockResolvedValue({ valide: true, message: 'Billet valide' }),
  };
  const controleur = new ControleController(service as unknown as ControleService);

  it('délègue la liste des séances et le scan au service', async () => {
    await controleur.seances();
    await controleur.scanner({ code: 'LGC1.1.2.x', seanceId: 2 });
    expect(service.seancesDuMoment).toHaveBeenCalled();
    expect(service.scanner).toHaveBeenCalledWith({ code: 'LGC1.1.2.x', seanceId: 2 });
  });
});
