import {
  BadRequestException,
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
import { AdminGuard } from '../auth/guards/admin.guard';
import { CheckOutService } from './check-out.service';

@Controller('admin/check-out')
@UseGuards(JwtAuthGuard, AdminGuard)
export class CheckOutController {
  constructor(private readonly checkOutService: CheckOutService) {}

  @Get('activities')
  async listActivities(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
    const limitNum = limit
      ? Math.min(100, Math.max(1, parseInt(limit, 10) || 20))
      : 20;
    return this.checkOutService.getActivitiesSummary(pageNum, limitNum);
  }

  @Get('activity/:activityId/items')
  async listActivityItems(
    @Param('activityId', ParseIntPipe) activityId: number,
    @Query('status') status?: 'all' | 'checked_out' | 'pending',
    @Query('search') search?: string,
    @Query('farm_name') farmName?: string,
  ) {
    return this.checkOutService.getActivityItems(activityId, {
      status: status || 'all',
      search: search || '',
      farm_name: farmName || '',
    });
  }

  @Post('item')
  async toggleItem(
    @Body('registration_id') registrationId?: number,
    @Body('entry_index') entryIndex?: string,
    @Body('checked_out') checkedOut?: boolean,
    @Request()
    req?: { user?: { id?: number; fullname?: string; email?: string } },
  ) {
    const id =
      typeof registrationId === 'number' && Number.isFinite(registrationId)
        ? registrationId
        : undefined;
    if (id == null) {
      throw new BadRequestException('กรุณาระบุ registration_id');
    }
    return this.checkOutService.setItemCheckout({
      registration_id: id,
      entry_index: String(entryIndex || ''),
      checked_out: !!checkedOut,
      actor_user_id: req?.user?.id ?? null,
      actor_name: req?.user?.fullname || req?.user?.email || null,
    });
  }
}
