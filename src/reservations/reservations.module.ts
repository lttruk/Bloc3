import { Module } from '@nestjs/common';
import { LiberationPlacesTask } from './liberation-places.task';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  controllers: [ReservationsController],
  providers: [ReservationsService, LiberationPlacesTask],
})
export class ReservationsModule {}
