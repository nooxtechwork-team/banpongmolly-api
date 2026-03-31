import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { OrderService } from './order.service';
import { User } from '../entities/user.entity';

@Controller('admin/orders')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminOrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get('by-order-no/:orderNo')
  async getOrderDetailByOrderNo(
    @Request() req: { user: User },
    @Param('orderNo') orderNo: string,
  ) {
    return this.orderService.findMyOrderDetail(req.user, orderNo, null, {
      entryCodePolicy: 'always',
    });
  }

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
