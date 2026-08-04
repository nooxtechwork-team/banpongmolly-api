import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Activity } from '../entities/activity.entity';
import { ActivityRegistration } from '../entities/activity-registration.entity';
import { ActivityPackage } from '../entities/activity-package.entity';
import { Order } from '../entities/order.entity';
import { AuthModule } from '../auth/auth.module';
import { OrderModule } from '../order/order.module';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';
import { ActivityPackageCountsController } from './activity-package-counts.controller';
import { CheckInOutReportController } from './check-in-out.controller';
import { FishRankingSheetController } from './fish-ranking-sheet.controller';
import { ActivityRegistrationModule } from '../activity-registration/activity-registration.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Activity,
      ActivityRegistration,
      ActivityPackage,
      Order,
    ]),
    AuthModule,
    OrderModule,
    ActivityRegistrationModule,
  ],
  controllers: [
    ReportController,
    ActivityPackageCountsController,
    CheckInOutReportController,
    FishRankingSheetController,
  ],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
