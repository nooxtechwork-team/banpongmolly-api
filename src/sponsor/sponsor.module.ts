import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SponsorRegistration } from '../entities/sponsor.entity';
import { Activity } from '../entities/activity.entity';
import { SponsorPackage } from '../entities/sponsor-package.entity';
import { ActivityModule } from '../activity/activity.module';
import { OrderModule } from '../order/order.module';
import { SponsorService } from './sponsor.service';
import { SponsorAdminController } from './sponsor.controller';
import { SponsorPackageService } from './sponsor-package.service';
import { SponsorPackageAdminController } from './sponsor-package.controller';
import { PublicSponsorController } from './public-sponsor.controller';
import { AdminGuard } from '../auth/guards/admin.guard';
import { UserActionLogModule } from '../user-action-log/user-action-log.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SponsorRegistration, Activity, SponsorPackage]),
    ActivityModule,
    OrderModule,
    UserActionLogModule,
  ],
  providers: [SponsorService, SponsorPackageService, AdminGuard],
  controllers: [SponsorAdminController, SponsorPackageAdminController, PublicSponsorController],
  exports: [SponsorService, SponsorPackageService],
})
export class SponsorModule {}

