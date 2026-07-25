import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CheckoutQueueService } from '../checkout-queue/checkout-queue.service';

/** Alias path from plan: GET /activities/:id/checkout-board */
@Controller('activities')
export class CheckoutBoardController {
  constructor(private readonly checkoutQueueService: CheckoutQueueService) {}

  @Get(':id/checkout-board')
  @UseGuards(JwtAuthGuard, AdminGuard)
  board(@Param('id', ParseIntPipe) id: number) {
    return this.checkoutQueueService.getBoard(id);
  }
}
