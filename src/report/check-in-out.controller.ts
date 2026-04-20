import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CheckOutService } from '../order/check-out.service';

@Controller('admin/reports/check-in-out')
@UseGuards(JwtAuthGuard, AdminGuard)
export class CheckInOutReportController {
  constructor(private readonly checkOutService: CheckOutService) {}

  @Get('activities')
  async listActivities(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<Awaited<ReturnType<CheckOutService['getActivitiesSummary']>>> {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
    const limitNum = limit
      ? Math.min(100, Math.max(1, parseInt(limit, 10) || 20))
      : 20;
    return this.checkOutService.getActivitiesSummary(pageNum, limitNum);
  }

  @Get('activities/:activityId')
  async getActivityItems(
    @Param('activityId', ParseIntPipe) activityId: number,
    @Query('status') status?: 'all' | 'checked_out' | 'pending' | 'requested',
    @Query('search') search?: string,
    @Query('farm_name') farmName?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<
    Awaited<ReturnType<CheckOutService['getActivityItems']>> & {
      total: number;
      page: number;
      limit: number;
    }
  > {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
    const limitNum = limit
      ? Math.min(200, Math.max(1, parseInt(limit, 10) || 50))
      : 50;
    const payload = await this.checkOutService.getActivityItems(activityId, {
      status:
        status === 'checked_out' ||
        status === 'pending' ||
        status === 'requested'
          ? status
          : 'all',
      search: search || '',
      farm_name: farmName || '',
    });
    const total = payload.items.length;
    const start = (pageNum - 1) * limitNum;
    const end = start + limitNum;
    return {
      ...payload,
      items: payload.items.slice(start, end),
      total,
      page: pageNum,
      limit: limitNum,
    };
  }
}
