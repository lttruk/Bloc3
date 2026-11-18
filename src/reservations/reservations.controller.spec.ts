import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

describe('ReservationsController', () => {
  it('renvoie la référence, le statut, l’expiration et le nombre de places', async () => {
    const expireLe = new Date('2027-03-27T10:10:00Z');
    const service = {
      verrouillerPlaces: jest.fn().mockResolvedValue({
        reference: 'A1B2C3D4E5F6',
        statut: 'EN_ATTENTE',
        expireLe,
        billets: [{}, {}],
      }),
    } as unknown as ReservationsService;
    const controleur = new ReservationsController(service);

    const reponse = await controleur.verrouiller(
      5,
      { places: [{ placeId: 42, tarifId: 1 }, { placeId: 43, tarifId: 1 }] },
      { id: 7, role: 'CLIENT' },
    );

    expect(service.verrouillerPlaces).toHaveBeenCalledWith(7, 5, expect.any(Object));
    expect(reponse).toEqual({
      reference: 'A1B2C3D4E5F6',
      statut: 'EN_ATTENTE',
      expireLe: '2027-03-27T10:10:00.000Z',
      nombrePlaces: 2,
    });
  });
});
