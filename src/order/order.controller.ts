import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { Order } from '../entities/order.entity';
import { OrderService } from './order.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Controller('orders')
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number): Promise<Order> {
    return this.orderRepository.findOneOrFail({ where: { id } });
  }
}

