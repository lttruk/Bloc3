import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/** Durée de conservation du journal des connexions (recommandation CNIL : 6 mois à 1 an). */
export const CONSERVATION_JOURNAL_MS = 183 * 24 * 3600 * 1000;
/** Les jetons révoqués sont gardés une journée pour détecter leur réutilisation. */
export const CONSERVATION_JETONS_REVOQUES_MS = 24 * 3600 * 1000;

@Injectable()
export class NettoyageAuthTask {
  private readonly logger = new Logger(NettoyageAuthTask.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Applique les durées de conservation : jetons expirés ou révoqués, journal ancien (US-2.2). */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async nettoyer(): Promise<{ jetons: number; connexions: number }> {
    const maintenant = Date.now();
    const [jetons, connexions] = await Promise.all([
      this.prisma.jetonRafraichissement.deleteMany({
        where: {
          OR: [
            { expireLe: { lt: new Date(maintenant) } },
            { revoqueLe: { lt: new Date(maintenant - CONSERVATION_JETONS_REVOQUES_MS) } },
          ],
        },
      }),
      this.prisma.journalConnexion.deleteMany({
        where: { creeLe: { lt: new Date(maintenant - CONSERVATION_JOURNAL_MS) } },
      }),
    ]);
    if (jetons.count + connexions.count > 0) {
      this.logger.log(`${jetons.count} jeton(s) et ${connexions.count} connexion(s) supprimés`);
    }
    return { jetons: jetons.count, connexions: connexions.count };
  }
}
