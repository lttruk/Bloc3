import { Module } from '@nestjs/common';
import { CodeQrService } from './code-qr.service';

@Module({
  providers: [CodeQrService],
  exports: [CodeQrService],
})
export class BilletsModule {}
