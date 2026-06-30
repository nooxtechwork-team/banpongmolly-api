import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { User } from '../entities/user.entity';
import { ActivityService } from '../activity/activity.service';
import { OrderService } from './order.service';
import { OrderStatus } from '../entities/order.entity';
import {
  ConfirmOnsiteCashDto,
  CreateOnsiteRegistrationDto,
  RejectOnsiteCashDto,
} from './dto/onsite-payment.dto';
import { Audit } from '../common/decorators/audit.decorator';

@Controller('admin/onsite')
@UseGuards(JwtAuthGuard, AdminGuard)
export class OnsiteAdminController {
  constructor(
    private readonly activityService: ActivityService,
    private readonly orderService: OrderService,
  ) {}

  @Get('orders')
  async listCashOrders(
    @Query('activity_id', ParseIntPipe) activityId: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    let statusFilter: OrderStatus | 'pending_cash' | undefined;
    if (status === 'pending') statusFilter = OrderStatus.PENDING;
    else if (status === 'paid') statusFilter = OrderStatus.PAID;
    else if (status === 'pending_cash') statusFilter = 'pending_cash';

    return this.orderService.findOnsiteCashOrders(activityId, {
      search: search?.trim() || undefined,
      status: statusFilter,
    });
  }

  @Post('registrations')
  @Audit({ action: 'create', entity_type: 'payment' })
  async createRegistration(
    @Body() dto: CreateOnsiteRegistrationDto,
    @Request() req: ExpressRequest & { user: User },
  ) {
    const ipHeader =
      (req.headers?.['x-forwarded-for'] as string | undefined) || '';
    const clientIp = ipHeader.split(',')[0]?.trim() || req.ip || null;
    const userAgent =
      (req.headers?.['user-agent'] as string | undefined) || null;

    return this.activityService.createOnsiteRegistrationForStaff(
      dto.activity_id,
      {
        applicant_name: dto.applicant_name,
        farm_name: dto.farm_name,
        address: dto.address,
        phone: dto.phone,
        email: dto.email,
        line: dto.line,
        note: dto.note,
        entries: dto.entries,
        cash_received_amount: dto.cash_received_amount,
        onsite_note: dto.onsite_note,
        accept_policies: dto.accept_policies,
        terms_policy_version: dto.terms_policy_version,
        privacy_policy_version: dto.privacy_policy_version,
      },
      dto.user_id,
      req.user.id,
      {
        ip: typeof clientIp === 'string' ? clientIp : null,
        userAgent,
      },
    );
  }

  @Post('orders/:id/confirm-cash')
  @Audit({
    action: 'approve',
    entity_type: 'payment',
    entityIdSource: 'param:id',
  })
  async confirmCash(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmOnsiteCashDto,
    @Request() req: ExpressRequest & { user: User },
  ) {
    const order = await this.orderService.confirmOnsiteCashPayment(
      id,
      req.user.id,
      {
        cash_received_amount: dto.cash_received_amount,
        onsite_note: dto.onsite_note,
      },
    );
    return {
      id: order.id,
      order_no: order.order_no,
      status: order.status,
      payment_method: order.payment_method,
      paid_at: order.paid_at?.toISOString() ?? null,
    };
  }

  @Post('orders/:id/reject-cash')
  @Audit({
    action: 'reject',
    entity_type: 'payment',
    entityIdSource: 'param:id',
  })
  async rejectCash(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectOnsiteCashDto,
  ) {
    const order = await this.orderService.rejectOnsiteCashPayment(
      id,
      dto.reason,
    );
    return {
      id: order.id,
      order_no: order.order_no,
      status: order.status,
      cancel_reason: order.cancel_reason,
    };
  }
}
