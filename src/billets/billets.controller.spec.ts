import { BilletsController } from './billets.controller';
import { BilletsService } from './billets.service';

describe('BilletsController', () => {
  it('liste les billets au nom de l’utilisateur du jeton', async () => {
    const service = { billetsDeReservation: jest.fn().mockResolvedValue([]) };
    const controleur = new BilletsController(service as unknown as BilletsService);
    await controleur.lister({ id: 4, role: 'CLIENT' }, 'REF123');
    expect(service.billetsDeReservation).toHaveBeenCalledWith(4, 'REF123');
  });
});
