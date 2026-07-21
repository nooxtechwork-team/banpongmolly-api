import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Activity } from '../entities/activity.entity';
import { Tag } from '../entities/tag.entity';
import { ActivityTag } from '../entities/activity-tag.entity';
import { ActivityRegistration } from '../entities/activity-registration.entity';
import { ActivityFavorite } from '../entities/activity-favorite.entity';
import { ActivitySponsorPackage } from '../entities/activity-sponsor-package.entity';
import { SponsorPackage } from '../entities/sponsor-package.entity';
import { SponsorRegistration } from '../entities/sponsor.entity';
import { ActivityCompetitionDashboard } from '../entities/activity-competition-dashboard.entity';
import { ActivityCompetitionDashboardClassBlock } from '../entities/activity-competition-dashboard-class-block.entity';
import { ActivityCompetitionDashboardEntry } from '../entities/activity-competition-dashboard-entry.entity';
import { ActivityService } from './activity.service';
import { ActivityCompetitionDashboardService } from './activity-competition-dashboard.service';
import { ActivityFavoriteService } from './activity-favorite.service';
import { ActivityTagService } from './activity-tag.service';
import { ActivityController } from './activity.controller';
import { PublicActivityController } from './public-activity.controller';
import { AdminGuard } from '../auth/guards/admin.guard';
import { UploadModule } from '../upload/upload.module';
import { ActivityPackageModule } from '../activity-package/activity-package.module';
import { OrderModule } from '../order/order.module';
import { UserActionLogModule } from '../user-action-log/user-action-log.module';
import { LegalModule } from '../legal/legal.module';
import { ActivityRegistrationModule } from '../activity-registration/activity-registration.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Activity,
      Tag,
      ActivityTag,
      ActivityRegistration,
      ActivityFavorite,
      ActivitySponsorPackage,
      SponsorPackage,
      SponsorRegistration,
      ActivityCompetitionDashboard,
      ActivityCompetitionDashboardClassBlock,
      ActivityCompetitionDashboardEntry,
    ]),
    UploadModule,
    ActivityPackageModule,
    forwardRef(() => OrderModule),
    forwardRef(() => ActivityRegistrationModule),
    UserActionLogModule,
    LegalModule,
  ],
  providers: [
    ActivityService,
    ActivityCompetitionDashboardService,
    ActivityFavoriteService,
    ActivityTagService,
    AdminGuard,
  ],
  controllers: [ActivityController, PublicActivityController],
  exports: [
    ActivityService,
    ActivityCompetitionDashboardService,
    ActivityTagService,
  ],
})
export class ActivityModule {}
