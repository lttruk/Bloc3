import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProgrammationController } from './programmation.controller';
import { ProgrammationService } from './programmation.service';

@Module({
  imports: [AuthModule],
  controllers: [ProgrammationController],
  providers: [ProgrammationService],
})
export class AdminModule {}
