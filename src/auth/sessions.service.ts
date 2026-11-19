import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { JetonDto } from './dto/auth.dto';

export interface SessionOuverte {
  jeton: JetonDto;
  /** Jeton de rafraîchissement en clair : transmis une seule fois, dans un cookie httpOnly. */
  rafraichissement: string;
  expireLe: Date;
}

const MESSAGE_SESSION = 'Session expirée : reconnectez-vous.';
/** Deux onglets peuvent renouveler la session au même instant : ce n'est pas un vol de jeton. */
export const DELAI_GRACE_MS = 30_000;

export const empreinteJeton = (brut: string) => createHash('sha256').update(brut).digest('hex');

/** Jeton d'accès court (JWT) et jeton de rafraîchissement à usage unique, renouvelé à chaque usage (US-2.2). */
@Injectable()
export class SessionsService {
  private readonly dureeMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.dureeMs = Number(config.get('JWT_REFRESH_DAYS', 7)) * 24 * 3600 * 1000;
  }

  async ouvrir(utilisateurId: number, role: Role): Promise<SessionOuverte> {
    const rafraichissement = randomBytes(32).toString('base64url');
    const expireLe = new Date(Date.now() + this.dureeMs);
    await this.prisma.jetonRafraichissement.create({
      data: { utilisateurId, empreinte: empreinteJeton(rafraichissement), expireLe },
    });
    const accessToken = await this.jwt.signAsync({ sub: utilisateurId, role });
    return { jeton: { accessToken, role }, rafraichissement, expireLe };
  }

  /** Échange un jeton de rafraîchissement valide contre une nouvelle session (rotation). */
  async renouveler(brut?: string): Promise<SessionOuverte> {
    if (!brut) throw new UnauthorizedException(MESSAGE_SESSION);
    const maintenant = new Date();
    const jeton = await this.prisma.jetonRafraichissement.findUnique({
      where: { empreinte: empreinteJeton(brut) },
      select: {
        id: true,
        utilisateurId: true,
        expireLe: true,
        revoqueLe: true,
        utilisateur: { select: { role: true } },
      },
    });
    if (!jeton || jeton.expireLe <= maintenant) throw new UnauthorizedException(MESSAGE_SESSION);

    if (jeton.revoqueLe) {
      // Jeton déjà échangé puis présenté à nouveau : il a pu être volé, toutes les sessions sont fermées.
      if (maintenant.getTime() - jeton.revoqueLe.getTime() > DELAI_GRACE_MS) {
        await this.revoquerTout(jeton.utilisateurId);
      }
      throw new UnauthorizedException(MESSAGE_SESSION);
    }

    // Révocation conditionnelle : si deux requêtes arrivent ensemble, une seule obtient la nouvelle session.
    const { count } = await this.prisma.jetonRafraichissement.updateMany({
      where: { id: jeton.id, revoqueLe: null },
      data: { revoqueLe: maintenant },
    });
    if (count === 0) throw new UnauthorizedException(MESSAGE_SESSION);
    // Le rôle est relu : un changement de droits s'applique dès le renouvellement.
    return this.ouvrir(jeton.utilisateurId, jeton.utilisateur.role);
  }

  /** Déconnexion : le jeton de rafraîchissement présenté ne peut plus servir. */
  async fermer(brut?: string): Promise<void> {
    if (!brut) return;
    await this.prisma.jetonRafraichissement.updateMany({
      where: { empreinte: empreinteJeton(brut), revoqueLe: null },
      data: { revoqueLe: new Date() },
    });
  }

  async revoquerTout(utilisateurId: number): Promise<void> {
    await this.prisma.jetonRafraichissement.updateMany({
      where: { utilisateurId, revoqueLe: null },
      data: { revoqueLe: new Date() },
    });
  }
}
