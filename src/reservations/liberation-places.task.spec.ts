import { PrismaService } from '../prisma/prisma.service';
import { LiberationPlacesTask } from './liberation-places.task';

describe('LiberationPlacesTask', () => {
  let tx: any;
  let tache: LiberationPlacesTask;

  beforeEach(() => {
    tx = {
      reservation: { findMany: jest.fn(), updateMany: jest.fn() },
      billet: { updateMany: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)) };
    tache = new LiberationPlacesTask(prisma as unknown as PrismaService);
  });

  it('annule les billets et expire les réservations dont le verrou a expiré', async () => {
    tx.reservation.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    await expect(tache.libererPlacesExpirees()).resolves.toBe(2);
    expect(tx.billet.updateMany).toHaveBeenCalledWith({
      where: { reservationId: { in: [1, 2] } },
      data: { statut: 'ANNULE' },
    });
    expect(tx.reservation.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2] }, statut: 'EN_ATTENTE' },
      data: { statut: 'EXPIREE' },
    });
  });

  it("ne modifie rien quand aucune réservation n'a expiré", async () => {
    tx.reservation.findMany.mockResolvedValue([]);
    await expect(tache.libererPlacesExpirees()).resolves.toBe(0);
    expect(tx.billet.updateMany).not.toHaveBeenCalled();
  });
});
