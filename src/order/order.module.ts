import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../entities/order.entity';
import { ActivityRegistration } from '../entities/activity-registration.entity';
import { Activity } from '../entities/activity.entity';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { MyOrderController } from './my-order.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Order, ActivityRegistration, Activity])],
  providers: [OrderService],
  controllers: [OrderController, MyOrderController],
  exports: [OrderService],
})
export class OrderModule {}

