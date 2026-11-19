import { FilmsController } from './films.controller';
import { FilmsService } from './films.service';

describe('FilmsController', () => {
  const service = { fiche: jest.fn().mockResolvedValue({ id: 3, seances: [] }) };
  const controleur = new FilmsController(service as unknown as FilmsService);

  it('renvoie la fiche du film demandé', async () => {
    await expect(controleur.fiche(3)).resolves.toEqual({ id: 3, seances: [] });
    expect(service.fiche).toHaveBeenCalledWith(3);
  });
});
