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
import { Audit } from '../common/decorators/audit.decorator';

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

  @Get('sponsors')
  async listSponsors(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ): Promise<
    Awaited<ReturnType<typeof this.orderService.findAdminSponsorPayments>>
  > {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
    const limitNum = limit
      ? Math.min(100, Math.max(1, parseInt(limit, 10) || 10))
      : 10;
    let statusEnum: OrderStatus | 'all' | undefined;
    if (status === 'pending') statusEnum = OrderStatus.PENDING;
    else if (status === 'paid') statusEnum = OrderStatus.PAID;
    else if (status === 'cancelled') statusEnum = OrderStatus.CANCELLED;
    else if (status === 'all') statusEnum = 'all';

    return this.orderService.findAdminSponsorPayments(pageNum, limitNum, {
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

  @Get('sponsors/summary')
  async sponsorsSummary(): Promise<
    Awaited<ReturnType<typeof this.orderService.getAdminSponsorPaymentsSummary>>
  > {
    return this.orderService.getAdminSponsorPaymentsSummary();
  }

  @Get(':id')
  async getDetail(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<
    Awaited<ReturnType<typeof this.orderService.findAdminPaymentDetail>>
  > {
    return this.orderService.findAdminPaymentDetail(id);
  }

  @Get('sponsors/:id')
  async getSponsorDetail(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<
    Awaited<ReturnType<typeof this.orderService.findAdminSponsorPaymentDetail>>
  > {
    return this.orderService.findAdminSponsorPaymentDetail(id);
  }

  @Post(':id/approve')
  @Audit({
    action: 'approve',
    entity_type: 'payment',
    entityIdSource: 'param:id',
  })
  async approve(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.orderService.updateStatusAdmin(id, OrderStatus.PAID, null);
  }

  @Post(':id/reject')
  @Audit({
    action: 'reject',
    entity_type: 'payment',
    entityIdSource: 'param:id',
  })
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason?: string,
  ): Promise<void> {
    const trimmed = reason?.trim() || null;
    await this.orderService.updateStatusAdmin(
      id,
      OrderStatus.CANCELLED,
      trimmed,
    );
  }
}
