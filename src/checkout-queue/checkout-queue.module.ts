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
import { PosAuthModule } from '../pos-auth/pos-auth.module';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CheckoutQueueService } from './checkout-queue.service';
import { CheckoutQueueGateway } from './checkout-queue.gateway';
import { CheckoutQueueAdminController } from './checkout-queue-admin.controller';
import { MyCheckoutQueueController } from './checkout-queue-my.controller';
import { CheckoutBoardController } from './checkout-board.controller';
import { PosDeviceController } from './pos-device.controller';

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
    PosAuthModule,
  ],
  controllers: [
    CheckoutQueueAdminController,
    MyCheckoutQueueController,
    CheckoutBoardController,
    PosDeviceController,
  ],
  providers: [CheckoutQueueService, CheckoutQueueGateway, AdminGuard],
  exports: [CheckoutQueueService],
})
export class CheckoutQueueModule {}
