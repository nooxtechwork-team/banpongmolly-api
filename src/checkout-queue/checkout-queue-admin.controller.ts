import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { User } from '../entities/user.entity';
import { CheckoutQueueService } from './checkout-queue.service';
import {
  CancelCheckoutTicketDto,
  UpdateCheckoutDeviceDto,
  UpsertCheckoutDeviceDto,
} from './dto/checkout-queue.dto';

@Controller('admin/checkout-queue')
@UseGuards(JwtAuthGuard, AdminGuard)
export class CheckoutQueueAdminController {
  constructor(private readonly checkoutQueueService: CheckoutQueueService) {}

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

  @Get('activities/:activityId/board')
  board(@Param('activityId', ParseIntPipe) activityId: number) {
    return this.checkoutQueueService.getBoard(activityId);
  }

  @Get('tickets/:id')
  getTicket(@Param('id', ParseIntPipe) id: number) {
    return this.checkoutQueueService.getTicketDetail(id);
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
