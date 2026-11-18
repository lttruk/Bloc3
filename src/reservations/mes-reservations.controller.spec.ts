import { MesReservationsController } from './mes-reservations.controller';
import { MesReservationsService } from './mes-reservations.service';

describe('MesReservationsController', () => {
  const service = {
    lister: jest.fn().mockResolvedValue([]),
    liberer: jest.fn().mockResolvedValue(undefined),
  };
  const controleur = new MesReservationsController(service as unknown as MesReservationsService);

  it('liste les réservations de l’utilisateur du jeton', async () => {
    await controleur.lister({ id: 7, role: 'CLIENT' });
    expect(service.lister).toHaveBeenCalledWith(7);
  });

  it('libère une réservation au nom de l’utilisateur du jeton', async () => {
    await controleur.liberer('A1B2C3D4E5F6', { id: 7, role: 'CLIENT' });
    expect(service.liberer).toHaveBeenCalledWith(7, 'A1B2C3D4E5F6');
  });
});
