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
   * ส่งอีเมลใบเสร็จพร้อมแนบไฟล์ PDF ให้ลูกค้าของออเดอร์นี้
   * - ใช้หลังจากอนุมัติการชำระเงินแล้ว (status = paid)
   */
  @Post(':id/send-receipt')
  async sendReceipt(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ success: boolean }> {
    await this.orderService.sendReceiptEmail(id);
    return { success: true };
  }
}
