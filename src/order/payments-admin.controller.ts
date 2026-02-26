import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { OrderService } from './order.service';
import { OrderStatus } from '../entities/order.entity';

@Controller('admin/payments')
@UseGuards(JwtAuthGuard, AdminGuard)
export class PaymentsAdminController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ): Promise<Awaited<ReturnType<typeof this.orderService.findAdminPayments>>> {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
    const limitNum = limit
      ? Math.min(100, Math.max(1, parseInt(limit, 10) || 10))
      : 10;
    let statusEnum: OrderStatus | 'all' | undefined;
    if (status === 'pending') statusEnum = OrderStatus.PENDING;
    else if (status === 'paid') statusEnum = OrderStatus.PAID;
    else if (status === 'cancelled') statusEnum = OrderStatus.CANCELLED;
    else if (status === 'all') statusEnum = 'all';

    return this.orderService.findAdminPayments(pageNum, limitNum, {
      status: statusEnum,
      search: search?.trim() || undefined,
    });
  }

  @Get('summary')
  async summary(): Promise<
    Awaited<ReturnType<typeof this.orderService.getAdminPaymentsSummary>>
  > {
    return this.orderService.getAdminPaymentsSummary();
  }

  @Get(':id')
  async getDetail(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<
    Awaited<ReturnType<typeof this.orderService.findAdminPaymentDetail>>
  > {
    return this.orderService.findAdminPaymentDetail(id);
  }

  @Post(':id/approve')
  async approve(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.orderService.updateStatusAdmin(id, OrderStatus.PAID);
  }

  @Post(':id/reject')
  async reject(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.orderService.updateStatusAdmin(id, OrderStatus.CANCELLED);
  }
}
