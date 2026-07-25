import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PrintJob } from '../entities/print-job.entity';
import { PosAuthModule } from '../pos-auth/pos-auth.module';
import { PrintJobController } from './print-job.controller';
import { PrintJobService } from './print-job.service';

@Module({
  imports: [TypeOrmModule.forFeature([PrintJob]), PosAuthModule],
  controllers: [PrintJobController],
  providers: [PrintJobService],
  exports: [PrintJobService],
})
export class PrintJobModule {}
