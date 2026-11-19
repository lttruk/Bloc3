import { PrismaService } from '../prisma/prisma.service';
import {
  CONSERVATION_JETONS_REVOQUES_MS,
  CONSERVATION_JOURNAL_MS,
  NettoyageAuthTask,
} from './nettoyage-auth.task';

describe('NettoyageAuthTask', () => {
  const MAINTENANT = new Date('2027-03-27T03:00:00Z');
  let prisma: any;
  let tache: NettoyageAuthTask;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(MAINTENANT);
    prisma = {
      jetonRafraichissement: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      journalConnexion: { deleteMany: jest.fn().mockResolvedValue({ count: 5 }) },
    };
    tache = new NettoyageAuthTask(prisma as PrismaService);
  });

  afterEach(() => jest.useRealTimers());

  it('supprime les jetons expirés ou révoqués et le journal au-delà de sa durée de conservation', async () => {
    await expect(tache.nettoyer()).resolves.toEqual({ jetons: 2, connexions: 5 });
    expect(prisma.jetonRafraichissement.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { expireLe: { lt: MAINTENANT } },
          {
            revoqueLe: { lt: new Date(MAINTENANT.getTime() - CONSERVATION_JETONS_REVOQUES_MS) },
          },
        ],
      },
    });
    expect(prisma.journalConnexion.deleteMany).toHaveBeenCalledWith({
      where: { creeLe: { lt: new Date(MAINTENANT.getTime() - CONSERVATION_JOURNAL_MS) } },
    });
  });
});
