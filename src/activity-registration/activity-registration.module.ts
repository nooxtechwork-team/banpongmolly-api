import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityRegistration } from '../entities/activity-registration.entity';
import { ActivityClassChangeRequest } from '../entities/activity-class-change-request.entity';
import { ActivityClassChangeLog } from '../entities/activity-class-change-log.entity';
import { ActivityRegistrationEntry } from '../entities/activity-registration-entry.entity';
import { Activity } from '../entities/activity.entity';
import { Order } from '../entities/order.entity';
import { ActivityPackage } from '../entities/activity-package.entity';
import { ActivityRegistrationService } from './activity-registration.service';
import { ActivityRegistrationEntryService } from './activity-registration-entry.service';
import { ActivityRegistrationController } from './activity-registration.controller';
import { MyClassChangeController } from './my-class-change.controller';
import { AdminClassChangeController } from './admin-class-change.controller';
import { ActivityModule } from '../activity/activity.module';
import { ActivityPackageModule } from '../activity-package/activity-package.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { AdminGuard } from '../auth/guards/admin.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ActivityRegistration,
      ActivityClassChangeRequest,
      ActivityClassChangeLog,
      ActivityRegistrationEntry,
      Activity,
      Order,
      ActivityPackage,
    ]),
    forwardRef(() => ActivityModule),
    ActivityPackageModule,
    AuditLogModule,
    AuthModule,
  ],
  providers: [ActivityRegistrationService, ActivityRegistrationEntryService, AdminGuard],
  controllers: [
    ActivityRegistrationController,
    MyClassChangeController,
    AdminClassChangeController,
  ],
  exports: [ActivityRegistrationService, ActivityRegistrationEntryService],
})
export class ActivityRegistrationModule {}
