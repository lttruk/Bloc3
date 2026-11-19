import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BilletsService } from './billets.service';

jest.mock('qrcode', () => ({ toString: jest.fn(async (texte: string) => `<svg>${texte}</svg>`) }));

const reservation = (surcharges: Record<string, unknown> = {}) => ({
  statut: 'CONFIRMEE',
  utilisateur: { prenom: 'Camille', nom: 'Durand' },
  seance: {
    debut: new Date('2027-03-28T19:00:00Z'),
    version: 'VO',
    film: { titre: 'Hors Ligne' },
    salle: { nom: 'Salle 1' },
  },
  billets: [
    {
      id: 11,
      codeQr: 'LGC1.11.3.sig',
      statut: 'ACTIF',
      scanneLe: null,
      prixApplique: 9,
      place: { rangee: 'A', numero: 1, type: 'PMR' },
      tarif: { libelle: 'Réduit', justificatifRequis: true },
    },
  ],
  ...surcharges,
});

describe('BilletsService', () => {
  const prisma = { reservation: { findFirst: jest.fn() } };
  const service = new BilletsService(prisma as unknown as PrismaService);

  it('renvoie les billets d’une réservation payée avec leur QR code SVG', async () => {
    prisma.reservation.findFirst.mockResolvedValue(reservation());
    const [billet] = await service.billetsDeReservation(4, 'REF123');
    expect(billet).toMatchObject({
      film: 'Hors Ligne',
      place: 'A1',
      pmr: true,
      tarif: 'Réduit',
      justificatifRequis: true,
      prix: 9,
      titulaire: 'Camille Durand',
      codeQr: 'LGC1.11.3.sig',
      qrSvg: '<svg>LGC1.11.3.sig</svg>',
    });
    expect(prisma.reservation.findFirst.mock.calls[0][0].where).toEqual({
      reference: 'REF123',
      utilisateurId: 4,
    });
  });

  it('cache la réservation d’un autre spectateur', async () => {
    prisma.reservation.findFirst.mockResolvedValue(null);
    await expect(service.billetsDeReservation(4, 'REF123')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuse les billets d’une réservation non payée', async () => {
    prisma.reservation.findFirst.mockResolvedValue(reservation({ statut: 'EN_ATTENTE' }));
    await expect(service.billetsDeReservation(4, 'REF123')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
