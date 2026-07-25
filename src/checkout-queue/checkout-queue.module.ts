import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CheckoutDevice } from '../entities/checkout-device.entity';
import { CheckoutTicket } from '../entities/checkout-ticket.entity';
import { CheckoutTicketItem } from '../entities/checkout-ticket-item.entity';
import { CheckoutTicketEvent } from '../entities/checkout-ticket-event.entity';
import { ActivityRegistration } from '../entities/activity-registration.entity';
import { ActivityRegistrationEntry } from '../entities/activity-registration-entry.entity';
import { Activity } from '../entities/activity.entity';
import { Order } from '../entities/order.entity';
import { AuthModule } from '../auth/auth.module';
import { ActivityPackageModule } from '../activity-package/activity-package.module';
import { PrintJobModule } from '../print-job/print-job.module';
import { PosDeviceKeyGuard } from '../print-job/pos-device-key.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CheckoutQueueService } from './checkout-queue.service';
import { CheckoutQueueGateway } from './checkout-queue.gateway';
import { CheckoutQueueController } from './checkout-queue.controller';
import { CheckoutQueueAdminController } from './checkout-queue-admin.controller';
import { MyCheckoutQueueController } from './checkout-queue-my.controller';
import { CheckoutBoardController } from './checkout-board.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CheckoutDevice,
      CheckoutTicket,
      CheckoutTicketItem,
      CheckoutTicketEvent,
      ActivityRegistration,
      ActivityRegistrationEntry,
      Activity,
      Order,
    ]),
    AuthModule,
    ActivityPackageModule,
    PrintJobModule,
  ],
  controllers: [
    CheckoutQueueController,
    CheckoutQueueAdminController,
    MyCheckoutQueueController,
    CheckoutBoardController,
  ],
  providers: [
    CheckoutQueueService,
    CheckoutQueueGateway,
    PosDeviceKeyGuard,
    AdminGuard,
  ],
  exports: [CheckoutQueueService],
})
export class CheckoutQueueModule {}
