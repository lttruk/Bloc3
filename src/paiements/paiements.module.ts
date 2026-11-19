import { Module } from '@nestjs/common';
import { BilletsModule } from '../billets/billets.module';
import { PaiementsController } from './paiements.controller';
import { PaiementsService } from './paiements.service';
import { StripeClient } from './stripe.client';

@Module({
  imports: [BilletsModule],
  controllers: [PaiementsController],
  providers: [PaiementsService, StripeClient],
})
export class PaiementsModule {}
