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
import { SponsorService } from './sponsor.service';

@Controller('admin/sponsors')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SponsorAdminController {
  constructor(private readonly sponsorService: SponsorService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('tier') tier?: string,
    @Query('activity_id') activityId?: string,
    @Query('status') status?: string,
  ): Promise<Awaited<ReturnType<typeof this.sponsorService.listAdmin>>> {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
    const limitNum = limit
      ? Math.min(100, Math.max(1, parseInt(limit, 10) || 10))
      : 10;

    return this.sponsorService.listAdmin({
      page: pageNum,
      limit: limitNum,
      search: search?.trim() || undefined,
      tier:
        tier === 'supporter' || tier === 'main' || tier === 'premium'
          ? tier
          : 'all',
      activity_id: activityId ? parseInt(activityId, 10) || undefined : undefined,
      status:
        status === 'pending_payment_review' ||
        status === 'active' ||
        status === 'cancelled'
          ? status
          : 'all',
    });
  }

  @Get(':id')
  async getOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<Awaited<ReturnType<typeof this.sponsorService.findOneAdmin>>> {
    return this.sponsorService.findOneAdmin(id);
  }
}

