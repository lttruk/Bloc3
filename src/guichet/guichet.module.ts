import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BilletsModule } from '../billets/billets.module';
import { GuichetController } from './guichet.controller';
import { GuichetService } from './guichet.service';

@Module({
  imports: [AuthModule, BilletsModule],
  controllers: [GuichetController],
  providers: [GuichetService],
})
export class GuichetModule {}
