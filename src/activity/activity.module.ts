import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Activity } from '../entities/activity.entity';
import { ActivityReward } from '../entities/activity-reward.entity';
import { Tag } from '../entities/tag.entity';
import { ActivityTag } from '../entities/activity-tag.entity';
import { ActivityRegistration } from '../entities/activity-registration.entity';
import { ActivitySponsorPackage } from '../entities/activity-sponsor-package.entity';
import { SponsorPackage } from '../entities/sponsor-package.entity';
import { ActivityService } from './activity.service';
import { ActivityRewardService } from './activity-reward.service';
import { ActivityTagService } from './activity-tag.service';
import { ActivityController } from './activity.controller';
import { PublicActivityController } from './public-activity.controller';
import { AdminGuard } from '../auth/guards/admin.guard';
import { UploadModule } from '../upload/upload.module';
import { ActivityPackageModule } from '../activity-package/activity-package.module';
import { OrderModule } from '../order/order.module';
import { UserActionLogModule } from '../user-action-log/user-action-log.module';
import { LegalModule } from '../legal/legal.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Activity,
      ActivityReward,
      Tag,
      ActivityTag,
      ActivityRegistration,
      ActivitySponsorPackage,
      SponsorPackage,
    ]),
    UploadModule,
    ActivityPackageModule,
    OrderModule,
    UserActionLogModule,
    LegalModule,
  ],
  providers: [
    ActivityService,
    ActivityRewardService,
    ActivityTagService,
    AdminGuard,
  ],
  controllers: [ActivityController, PublicActivityController],
  exports: [ActivityService],
})
export class ActivityModule {}
