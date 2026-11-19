import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BilletsModule } from '../billets/billets.module';
import { ControleController } from './controle.controller';
import { ControleService } from './controle.service';

@Module({
  imports: [AuthModule, BilletsModule],
  controllers: [ControleController],
  providers: [ControleService],
})
export class ControleModule {}
