import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LiberationPlacesTask {
  private readonly logger = new Logger(LiberationPlacesTask.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Libère les places des réservations en attente dont le verrou a expiré (idempotent). */
  @Cron(CronExpression.EVERY_MINUTE)
  async libererPlacesExpirees(): Promise<number> {
    const nombre = await this.prisma.$transaction(async (tx) => {
      const expirees = await tx.reservation.findMany({
        where: { statut: 'EN_ATTENTE', expireLe: { lt: new Date() } },
        select: { id: true },
      });
      const ids = expirees.map((r) => r.id);
      if (ids.length === 0) return 0;
      // Billet annulé => place_occupee passe à NULL => la place est de nouveau libre
      await tx.billet.updateMany({
        where: { reservationId: { in: ids } },
        data: { statut: 'ANNULE' },
      });
      await tx.reservation.updateMany({
        where: { id: { in: ids }, statut: 'EN_ATTENTE' },
        data: { statut: 'EXPIREE' },
      });
      return ids.length;
    });
    if (nombre > 0) this.logger.log(`${nombre} réservation(s) expirée(s), places libérées`);
    return nombre;
  }
}
