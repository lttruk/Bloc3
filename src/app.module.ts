import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { BilletsModule } from './billets/billets.module';
import { ControleModule } from './controle/controle.module';
import { FilmsModule } from './films/films.module';
import { GuichetModule } from './guichet/guichet.module';
import { PaiementsModule } from './paiements/paiements.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReservationsModule } from './reservations/reservations.module';
import { SanteController } from './sante/sante.controller';
import { SeancesModule } from './seances/seances.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    SeancesModule,
    FilmsModule,
    ReservationsModule,
    AdminModule,
    PaiementsModule,
    BilletsModule,
    ControleModule,
    GuichetModule,
  ],
  controllers: [SanteController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
