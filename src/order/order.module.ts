import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../entities/order.entity';
import { ActivityRegistration } from '../entities/activity-registration.entity';
import { Activity } from '../entities/activity.entity';
import { SponsorRegistration } from '../entities/sponsor.entity';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { MyOrderController } from './my-order.controller';
import { ApplicantsService } from './applicants.service';
import { ApplicantsController } from './applicants.controller';
import { CheckInService } from './check-in.service';
import { CheckInController } from './check-in.controller';
import { PaymentsAdminController } from './payments-admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Order, ActivityRegistration, Activity, SponsorRegistration])],
  providers: [OrderService, ApplicantsService, CheckInService],
  controllers: [
    OrderController,
    MyOrderController,
    ApplicantsController,
    CheckInController,
    PaymentsAdminController,
  ],
  exports: [OrderService],
})
export class OrderModule {}

