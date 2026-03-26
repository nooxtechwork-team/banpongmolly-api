import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../entities/order.entity';
import { ActivityRegistration } from '../entities/activity-registration.entity';
import { Activity } from '../entities/activity.entity';
import { SponsorRegistration } from '../entities/sponsor.entity';
import { ActivityPackage } from '../entities/activity-package.entity';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { MyOrderController } from './my-order.controller';
import { ApplicantsService } from './applicants.service';
import { ApplicantsController } from './applicants.controller';
import { CheckInService } from './check-in.service';
import { CheckInController } from './check-in.controller';
import { CheckInGateway } from './check-in.gateway';
import { PaymentsAdminController } from './payments-admin.controller';
import { DashboardAdminController } from './dashboard-admin.controller';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AdminOrderController } from './admin-order.controller';
import { CheckOutService } from './check-out.service';
import { CheckOutController } from './check-out.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      ActivityRegistration,
      Activity,
      SponsorRegistration,
      ActivityPackage,
    ]),
    AuditLogModule,
  ],
  providers: [
    OrderService,
    ApplicantsService,
    CheckInService,
    CheckOutService,
    CheckInGateway,
  ],
  controllers: [
    OrderController,
    MyOrderController,
    ApplicantsController,
    CheckInController,
    PaymentsAdminController,
    AdminOrderController,
    DashboardAdminController,
    CheckOutController,
  ],
  exports: [OrderService],
})
export class OrderModule {}
