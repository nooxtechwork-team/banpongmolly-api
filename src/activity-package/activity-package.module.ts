import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityPackage } from '../entities/activity-package.entity';
import { ActivityPackagePrice } from '../entities/activity-package-price.entity';
import { ActivityPackageService } from './activity-package.service';
import { ActivityPackageController } from './activity-package.controller';
import { AdminGuard } from '../auth/guards/admin.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([ActivityPackage, ActivityPackagePrice]),
  ],
  providers: [ActivityPackageService, AdminGuard],
  controllers: [ActivityPackageController],
  exports: [ActivityPackageService],
})
export class ActivityPackageModule {}
