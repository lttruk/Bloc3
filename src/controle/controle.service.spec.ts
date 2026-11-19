import { CodeQrService } from '../billets/code-qr.service';
import { PrismaService } from '../prisma/prisma.service';
import { ControleService } from './controle.service';

const MAINTENANT = new Date('2027-01-15T18:50:00Z');
const CODE = 'LGC1.11.3.signature';

const billetEnBase = (surcharges: Record<string, unknown> = {}) => ({
  id: 11,
  seanceId: 3,
  codeQr: CODE,
  statut: 'ACTIF',
  scanneLe: null,
  place: { rangee: 'D', numero: 9 },
  tarif: { libelle: 'Réduit', justificatifRequis: true },
  seance: {
    debut: new Date('2027-01-15T19:00:00Z'),
    film: { titre: 'Hors Ligne' },
    salle: { nom: 'Salle 1' },
  },
  reservation: { statut: 'CONFIRMEE', utilisateur: { prenom: 'Camille', nom: 'Durand' } },
  ...surcharges,
});

describe('ControleService', () => {
  let prisma: any;
  let codesQr: { lire: jest.Mock };
  let service: ControleService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(MAINTENANT);
    prisma = {
      seance: { findMany: jest.fn() },
      billet: {
        findUnique: jest.fn().mockResolvedValue(billetEnBase()),
        findUniqueOrThrow: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    codesQr = { lire: jest.fn().mockReturnValue({ billetId: 11, seanceId: 3 }) };
    service = new ControleService(prisma as PrismaService, codesQr as unknown as CodeQrService);
  });

  afterEach(() => jest.useRealTimers());

  it('valide un billet actif, le marque utilisé et affiche film, salle et place', async () => {
    const resultat = await service.scanner({ code: ` ${CODE} `, seanceId: 3 });
    expect(resultat.valide).toBe(true);
    expect(resultat.billet).toMatchObject({
      film: 'Hors Ligne',
      salle: 'Salle 1',
      place: 'D9',
      justificatif: 'Réduit',
      titulaire: 'Camille Durand',
      scanneLe: MAINTENANT,
    });
    expect(prisma.billet.updateMany).toHaveBeenCalledWith({
      where: { id: 11, statut: 'ACTIF' },
      data: { statut: 'UTILISE', scanneLe: MAINTENANT },
    });
  });

  it('refuse un QR code falsifié ou illisible', async () => {
    codesQr.lire.mockReturnValue(null);
    const resultat = await service.scanner({ code: 'faux' });
    expect(resultat).toEqual({
      valide: false,
      motif: 'FALSIFIE',
      message: 'QR code invalide ou falsifié',
    });
    expect(prisma.billet.findUnique).not.toHaveBeenCalled();
  });

  it('refuse un code signé qui ne correspond pas au billet émis', async () => {
    prisma.billet.findUnique.mockResolvedValue(billetEnBase({ codeQr: 'LGC1.11.3.autre' }));
    expect((await service.scanner({ code: CODE })).motif).toBe('FALSIFIE');
    prisma.billet.findUnique.mockResolvedValue(null);
    expect((await service.scanner({ code: CODE })).motif).toBe('FALSIFIE');
  });

  it('signale un billet déjà utilisé avec l’heure du premier passage', async () => {
    prisma.billet.updateMany.mockResolvedValue({ count: 0 });
    prisma.billet.findUniqueOrThrow.mockResolvedValue(
      billetEnBase({ statut: 'UTILISE', scanneLe: new Date('2027-01-15T18:42:00Z') }),
    );
    const resultat = await service.scanner({ code: CODE });
    expect(resultat.valide).toBe(false);
    expect(resultat.motif).toBe('DEJA_UTILISE');
    expect(resultat.message).toBe('Billet déjà utilisé à 19:42');
  });

  it('refuse un billet annulé', async () => {
    prisma.billet.findUnique.mockResolvedValue(billetEnBase({ statut: 'ANNULE' }));
    const resultat = await service.scanner({ code: CODE });
    expect(resultat.motif).toBe('ANNULE');
    expect(prisma.billet.updateMany).not.toHaveBeenCalled();
  });

  it('refuse un billet d’une autre séance que celle contrôlée', async () => {
    const resultat = await service.scanner({ code: CODE, seanceId: 99 });
    expect(resultat.motif).toBe('AUTRE_SEANCE');
    expect(resultat.message).toContain('Hors Ligne');
    expect(prisma.billet.updateMany).not.toHaveBeenCalled();
  });

  it('liste les séances publiées du moment', async () => {
    prisma.seance.findMany.mockResolvedValue([
      { id: 3, debut: MAINTENANT, film: { titre: 'Hors Ligne' }, salle: { nom: 'Salle 1' } },
    ]);
    expect(await service.seancesDuMoment()).toEqual([
      { id: 3, debut: MAINTENANT, film: 'Hors Ligne', salle: 'Salle 1' },
    ]);
    expect(prisma.seance.findMany.mock.calls[0][0].where.statut).toBe('PUBLIEE');
  });
});
