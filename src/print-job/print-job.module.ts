import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PrintJob } from '../entities/print-job.entity';
import { PrintJobController } from './print-job.controller';
import { PrintJobService } from './print-job.service';
import { PosDeviceKeyGuard } from './pos-device-key.guard';

@Module({
  imports: [TypeOrmModule.forFeature([PrintJob])],
  controllers: [PrintJobController],
  providers: [PrintJobService, PosDeviceKeyGuard],
  exports: [PrintJobService],
})
export class PrintJobModule {}
