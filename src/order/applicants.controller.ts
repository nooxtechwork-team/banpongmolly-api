import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ApplicantsService } from './applicants.service';
import { OrderStatus } from '../entities/order.entity';

@Controller('admin/applicants')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ApplicantsController {
  constructor(private readonly applicantsService: ApplicantsService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('activity_id') activity_id?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ): Promise<{
    items: Awaited<ReturnType<ApplicantsService['findPaginated']>>['items'];
    total: number;
  }> {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
    const limitNum = limit
      ? Math.min(100, Math.max(1, parseInt(limit, 10) || 10))
      : 10;
    const activityId = activity_id ? parseInt(activity_id, 10) : undefined;
    const statusEnum =
      status === 'paid'
        ? OrderStatus.PAID
        : status === 'pending'
          ? OrderStatus.PENDING
          : status === 'cancelled'
            ? OrderStatus.CANCELLED
            : undefined;

    return this.applicantsService.findPaginated(pageNum, limitNum, {
      activity_id: Number.isFinite(activityId) ? activityId : undefined,
      status: statusEnum,
      search: search?.trim() || undefined,
    });
  }
}
