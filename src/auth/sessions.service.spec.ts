import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { DELAI_GRACE_MS, empreinteJeton, SessionsService } from './sessions.service';

describe('SessionsService', () => {
  const MAINTENANT = new Date('2027-03-27T10:00:00Z');
  let prisma: any;
  let jwt: any;
  let service: SessionsService;

  const jetonEnBase = (surcharges: Record<string, unknown> = {}) => ({
    id: 3,
    utilisateurId: 7,
    expireLe: new Date(MAINTENANT.getTime() + 3600_000),
    revoqueLe: null,
    utilisateur: { role: 'ADMIN' },
    ...surcharges,
  });

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(MAINTENANT);
    prisma = {
      jetonRafraichissement: {
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('jwt') };
    const config = { get: jest.fn().mockReturnValue('7') };
    service = new SessionsService(
      prisma as PrismaService,
      jwt as JwtService,
      config as unknown as ConfigService,
    );
  });

  afterEach(() => jest.useRealTimers());

  describe('ouvrir', () => {
    it('signe un JWT et ne stocke que l’empreinte du jeton de rafraîchissement', async () => {
      const session = await service.ouvrir(7, 'CLIENT');

      expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 7, role: 'CLIENT' });
      expect(session.jeton).toEqual({ accessToken: 'jwt', role: 'CLIENT' });
      expect(session.rafraichissement).toMatch(/^[\w-]{43}$/);
      const { data } = prisma.jetonRafraichissement.create.mock.calls[0][0];
      expect(data.empreinte).toBe(empreinteJeton(session.rafraichissement));
      expect(data.empreinte).not.toContain(session.rafraichissement);
      expect(data.expireLe).toEqual(new Date(MAINTENANT.getTime() + 7 * 24 * 3600 * 1000));
    });
  });

  describe('renouveler', () => {
    it('refuse l’absence de cookie, un jeton inconnu ou expiré', async () => {
      await expect(service.renouveler(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
      prisma.jetonRafraichissement.findUnique.mockResolvedValueOnce(null);
      await expect(service.renouveler('inconnu')).rejects.toBeInstanceOf(UnauthorizedException);
      prisma.jetonRafraichissement.findUnique.mockResolvedValueOnce(
        jetonEnBase({ expireLe: MAINTENANT }),
      );
      await expect(service.renouveler('expire')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.jetonRafraichissement.create).not.toHaveBeenCalled();
    });

    it('révoque l’ancien jeton et ouvre une nouvelle session avec le rôle à jour', async () => {
      prisma.jetonRafraichissement.findUnique.mockResolvedValue(jetonEnBase());

      const session = await service.renouveler('ancien');

      expect(prisma.jetonRafraichissement.findUnique.mock.calls[0][0].where).toEqual({
        empreinte: empreinteJeton('ancien'),
      });
      expect(prisma.jetonRafraichissement.updateMany).toHaveBeenCalledWith({
        where: { id: 3, revoqueLe: null },
        data: { revoqueLe: MAINTENANT },
      });
      expect(session.jeton.role).toBe('ADMIN');
      expect(session.rafraichissement).not.toBe('ancien');
    });

    it('ferme toutes les sessions si un jeton déjà échangé est réutilisé (vol probable)', async () => {
      prisma.jetonRafraichissement.findUnique.mockResolvedValue(
        jetonEnBase({ revoqueLe: new Date(MAINTENANT.getTime() - DELAI_GRACE_MS - 1000) }),
      );

      await expect(service.renouveler('vole')).rejects.toBeInstanceOf(UnauthorizedException);

      expect(prisma.jetonRafraichissement.updateMany).toHaveBeenCalledWith({
        where: { utilisateurId: 7, revoqueLe: null },
        data: { revoqueLe: MAINTENANT },
      });
    });

    it('tolère deux renouvellements simultanés sans tout révoquer', async () => {
      prisma.jetonRafraichissement.findUnique.mockResolvedValue(
        jetonEnBase({ revoqueLe: new Date(MAINTENANT.getTime() - 1000) }),
      );
      await expect(service.renouveler('double')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.jetonRafraichissement.updateMany).not.toHaveBeenCalled();
    });

    it('refuse le second de deux échanges concurrents du même jeton', async () => {
      prisma.jetonRafraichissement.findUnique.mockResolvedValue(jetonEnBase());
      prisma.jetonRafraichissement.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.renouveler('course')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.jetonRafraichissement.create).not.toHaveBeenCalled();
    });
  });

  describe('fermer', () => {
    it('révoque le jeton présenté', async () => {
      await service.fermer('brut');
      expect(prisma.jetonRafraichissement.updateMany).toHaveBeenCalledWith({
        where: { empreinte: empreinteJeton('brut'), revoqueLe: null },
        data: { revoqueLe: MAINTENANT },
      });
    });

    it('ne fait rien sans cookie', async () => {
      await service.fermer(undefined);
      expect(prisma.jetonRafraichissement.updateMany).not.toHaveBeenCalled();
    });
  });
});
