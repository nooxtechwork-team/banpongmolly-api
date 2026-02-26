import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SponsorRegistration } from '../entities/sponsor.entity';
import { Activity } from '../entities/activity.entity';
import { SponsorPackage } from '../entities/sponsor-package.entity';
import { SponsorService } from './sponsor.service';
import { SponsorAdminController } from './sponsor.controller';
import { SponsorPackageService } from './sponsor-package.service';
import { SponsorPackageAdminController } from './sponsor-package.controller';
import { AdminGuard } from '../auth/guards/admin.guard';

@Module({
  imports: [TypeOrmModule.forFeature([SponsorRegistration, Activity, SponsorPackage])],
  providers: [SponsorService, SponsorPackageService, AdminGuard],
  controllers: [SponsorAdminController, SponsorPackageAdminController],
  exports: [SponsorService, SponsorPackageService],
})
export class SponsorModule {}

