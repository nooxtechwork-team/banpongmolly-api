import {
  Controller,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { OrderService } from './order.service';

@Controller('admin/orders')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminOrderController {
  constructor(private readonly orderService: OrderService) {}

  /**
   * คิวส่งใบเสร็จให้สคริปต์ cron — ไม่สร้าง PDF / ไม่ส่งเมลใน request นี้
   * (ล้าง receipt_email_sent_at เพื่อให้ batch กวาดส่งต่อ)
   */
  @Post(':id/send-receipt')
  async sendReceipt(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ success: boolean; queued: boolean }> {
    await this.orderService.queueReceiptEmailForCron(id);
    return { success: true, queued: true };
  }
}
