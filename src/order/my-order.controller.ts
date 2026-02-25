import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  UseInterceptors,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { User } from '../entities/user.entity';
import { OrderService } from './order.service';
import { OrderStatus, OrderType } from '../entities/order.entity';

@Controller('my/orders')
@UseGuards(JwtAuthGuard)
@UseInterceptors(ResponseInterceptor)
export class MyOrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  async listMyOrders(
    @Request() req: { user: User },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
  ) {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
    const limitNum = limit
      ? Math.min(100, Math.max(1, parseInt(limit, 10) || 10))
      : 10;

    const normalizedStatus =
      status && Object.values(OrderStatus).includes(status as OrderStatus)
        ? (status as OrderStatus)
        : undefined;

    const normalizedType =
      type && Object.values(OrderType).includes(type as OrderType)
        ? (type as OrderType)
        : undefined;

    return this.orderService.findMyOrders(req.user, {
      page: pageNum,
      limit: limitNum,
      status: normalizedStatus,
      type: normalizedType,
      search,
    });
  }

  @Get(':orderNo')
  async getMyOrderDetail(
    @Request() req: { user: User },
    @Param('orderNo') orderNo: string,
  ) {
    return this.orderService.findMyOrderDetail(req.user, orderNo);
  }
}
