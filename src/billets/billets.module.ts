import { Module } from '@nestjs/common';
import { BilletsController } from './billets.controller';
import { BilletsService } from './billets.service';
import { CodeQrService } from './code-qr.service';

@Module({
  controllers: [BilletsController],
  providers: [CodeQrService, BilletsService],
  exports: [CodeQrService],
})
export class BilletsModule {}
