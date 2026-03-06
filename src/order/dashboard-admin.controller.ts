import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { OrderService } from './order.service';

@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, AdminGuard)
export class DashboardAdminController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  async metrics(): Promise<
    Awaited<ReturnType<typeof this.orderService.getAdminDashboardMetrics>>
  > {
    return this.orderService.getAdminDashboardMetrics();
  }
}

