import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { User } from '../entities/user.entity';
import { CheckoutTicketStatus } from '../entities/checkout-ticket.entity';
import { CheckoutQueueService } from './checkout-queue.service';
import {
  AdminCompleteCheckoutTicketDto,
  CancelCheckoutTicketDto,
  UpdateCheckoutDeviceDto,
  UpsertCheckoutDeviceDto,
  UpdateCheckoutQueueSettingsDto,
} from './dto/checkout-queue.dto';

@Controller('admin/checkout-queue')
@UseGuards(JwtAuthGuard, AdminGuard)
export class CheckoutQueueAdminController {
  constructor(private readonly checkoutQueueService: CheckoutQueueService) {}

  @Get('settings')
  getSettings() {
    return this.checkoutQueueService.getQueueSettings();
  }

  @Put('settings')
  updateSettings(@Body() dto: UpdateCheckoutQueueSettingsDto) {
    return this.checkoutQueueService.updateQueueSettings(dto);
  }

  @Get('devices')
  listDevices(@Query('activity_id') activityId?: string) {
    return this.checkoutQueueService.listDevices(
      activityId ? Number(activityId) : undefined,
    );
  }

  @Post('devices')
  createDevice(@Body() dto: UpsertCheckoutDeviceDto) {
    return this.checkoutQueueService.createDevice(dto);
  }

  @Patch('devices/:id')
  updateDevice(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCheckoutDeviceDto,
  ) {
    return this.checkoutQueueService.updateDevice(id, dto);
  }

  /** ออก API key ใหม่ให้เครื่อง (สำหรับตั้งค่าในแอป Sunmi) */
  @Post('devices/:id/rotate-key')
  rotateDeviceKey(@Param('id', ParseIntPipe) id: number) {
    return this.checkoutQueueService.rotateDeviceKey(id);
  }

  @Get('activities/:activityId/board')
  board(@Param('activityId', ParseIntPipe) activityId: number) {
    return this.checkoutQueueService.getBoard(activityId);
  }

  /** รายการคิวของกิจกรรม (default = คิววันนี้) สำหรับหน้า dashboard คิวเรียลไทม์ */
  @Get('activities/:activityId/tickets')
  listTickets(
    @Param('activityId', ParseIntPipe) activityId: number,
    @Query('status') status?: string,
    @Query('device_code') deviceCode?: string,
    @Query('queue_date') queueDate?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    const allowed = Object.values(CheckoutTicketStatus) as string[];
    if (status && status !== 'all' && !allowed.includes(status)) {
      throw new BadRequestException(`สถานะไม่ถูกต้อง: ${status}`);
    }
    return this.checkoutQueueService.listTicketsForAdmin(activityId, {
      status:
        status && status !== 'all' ? (status as CheckoutTicketStatus) : undefined,
      deviceCode,
      queueDate,
      search,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('tickets/:id')
  getTicket(@Param('id', ParseIntPipe) id: number) {
    return this.checkoutQueueService.getTicketDetail(id);
  }

  /** ปิดคิวแทนพนักงาน + มาร์คปลาในใบว่า checkout แล้วทันที */
  @Post('tickets/:id/complete')
  completeTicket(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminCompleteCheckoutTicketDto,
  ) {
    return this.checkoutQueueService.adminCompleteTicket(
      id,
      {
        userId: req.user.id,
        name: req.user.fullname || req.user.email || null,
      },
      dto,
    );
  }

  @Post('tickets/:id/cancel')
  cancelTicket(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelCheckoutTicketDto,
  ) {
    return this.checkoutQueueService.cancelTicket(
      id,
      { userId: req.user.id, isAdmin: true },
      dto,
    );
  }
}
