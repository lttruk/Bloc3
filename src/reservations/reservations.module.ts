import { Module } from '@nestjs/common';
import { LiberationPlacesTask } from './liberation-places.task';
import { MesReservationsController } from './mes-reservations.controller';
import { MesReservationsService } from './mes-reservations.service';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  controllers: [ReservationsController, MesReservationsController],
  providers: [ReservationsService, MesReservationsService, LiberationPlacesTask],
})
export class ReservationsModule {}
