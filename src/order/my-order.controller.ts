import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  UseInterceptors,
  Request,
  Res,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { User } from '../entities/user.entity';
import { OrderService } from './order.service';
import { OrderStatus, OrderType } from '../entities/order.entity';

@Controller('my/orders')
@UseGuards(JwtAuthGuard)
@UseInterceptors(ResponseInterceptor)
export class MyOrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  async listMyOrders(
    @Request() req: { user: User },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
  ) {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
    const limitNum = limit
      ? Math.min(100, Math.max(1, parseInt(limit, 10) || 10))
      : 10;

    const normalizedStatus =
      status && Object.values(OrderStatus).includes(status as OrderStatus)
        ? (status as OrderStatus)
        : undefined;

    const normalizedType =
      type && Object.values(OrderType).includes(type as OrderType)
        ? (type as OrderType)
        : undefined;

    return this.orderService.findMyOrders(req.user, {
      page: pageNum,
      limit: limitNum,
      status: normalizedStatus,
      type: normalizedType,
      search,
    });
  }

  /** ต้องประกาศก่อน @Get(':orderNo') */
  @Get('summary/pending-ticket-check-ins')
  async pendingTicketCheckIns(@Request() req: { user: User }) {
    const count = await this.orderService.countMyPendingTicketCheckIns(req.user);
    return { count };
  }

  @Get(':orderNo')
  async getMyOrderDetail(
    @Request() req: { user: User },
    @Param('orderNo') orderNo: string,
  ) {
    return this.orderService.findMyOrderDetail(req.user, orderNo);
  }

  @Get(':orderNo/receipt.pdf')
  @UseGuards(JwtAuthGuard)
  async downloadReceiptPdf(
    @Request() req: { user: User },
    @Param('orderNo') orderNo: string,
    @Res() res: any,
  ) {
    const { order } = await this.orderService.findMyOrderDetail(
      req.user,
      orderNo,
      OrderStatus.PAID,
    );
    const pdf = await this.orderService.generateReceiptPdf(order.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="receipt-${order.order_no}.pdf"`,
    );
    return res.send(Buffer.from(pdf));
  }
}
