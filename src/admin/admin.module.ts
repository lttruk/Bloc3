import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ParametrageController } from './parametrage.controller';
import { ParametrageService } from './parametrage.service';
import { ProgrammationController } from './programmation.controller';
import { ProgrammationService } from './programmation.service';

@Module({
  imports: [AuthModule],
  controllers: [ProgrammationController, ParametrageController],
  providers: [ProgrammationService, ParametrageService],
})
export class AdminModule {}
