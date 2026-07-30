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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User, UserRole } from '../entities/user.entity';
import { CheckoutQueueService } from './checkout-queue.service';
import {
  CancelCheckoutTicketDto,
  CreateCheckoutTicketDto,
} from './dto/checkout-queue.dto';

@Controller('my/checkout-tickets')
@UseGuards(JwtAuthGuard)
export class MyCheckoutQueueController {
  constructor(private readonly checkoutQueueService: CheckoutQueueService) {}

  @Post()
  create(@Request() req: { user: User }, @Body() dto: CreateCheckoutTicketDto) {
    return this.checkoutQueueService.createTicket(req.user, dto);
  }

  @Get()
  list(
    @Request() req: { user: User },
    @Query('activity_id') activityId?: string,
  ) {
    return this.checkoutQueueService.listMyTickets(
      req.user.id,
      activityId ? Number(activityId) : undefined,
    );
  }

  /** ปลาของฉันทั้งหมดสำหรับหน้า dashboard คืนปลา — ต้องมาก่อน @Get(':id') */
  @Get('entries')
  listEntries(
    @Request() req: { user: User },
    @Query('activity_id') activityId?: string,
  ) {
    return this.checkoutQueueService.listMyCheckoutEntries(
      req.user.id,
      activityId ? Number(activityId) : undefined,
    );
  }

  @Get(':id')
  getOne(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.checkoutQueueService.getMyTicket(req.user.id, id);
  }

  @Post(':id/cancel')
  cancel(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelCheckoutTicketDto,
  ) {
    return this.checkoutQueueService.cancelTicket(
      id,
      {
        userId: req.user.id,
        isAdmin: req.user.role === UserRole.ADMIN,
        name: req.user.fullname || req.user.email || null,
      },
      dto,
    );
  }
}
