import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { Activity } from '../entities/activity.entity';
import {
  ActivityLeafClass,
  ActivityService,
  ActivityPublicDetail,
} from './activity.service';
import { CalculateEntriesDto } from './dto/calculate-entries.dto';
import { CreateActivityRegistrationDto } from './dto/create-activity-registration.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('activities')
export class PublicActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: 'open' | 'upcoming' | 'finished',
    @Query('search') search?: string,
    @Query('sort') sort?: 'upcoming' | 'latest' | 'oldest',
    @Query('province_id') provinceId?: string,
  ): Promise<{ items: Activity[]; total: number } | Activity[]> {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
    const limitNum = limit
      ? Math.min(100, Math.max(1, parseInt(limit, 10) || 10))
      : 10;

    const province_id =
      provinceId && !Number.isNaN(parseInt(provinceId, 10))
        ? parseInt(provinceId, 10)
        : undefined;

    return this.activityService.findPublicPaginated(pageNum, limitNum, {
      status,
      search,
      sort,
      province_id,
    });
  }

  @Get('featured/homepage')
  async listFeaturedForHomepage() {
    return this.activityService.listFeaturedForHomepage();
  }

  @Get('slug/:slug')
  async detailBySlug(
    @Param('slug') slug: string,
  ): Promise<ActivityPublicDetail> {
    return this.activityService.getPublicDetailBySlug(slug);
  }

  @Get('slug/:slug/classes')
  async listLeafClasses(
    @Param('slug') slug: string,
  ): Promise<ActivityLeafClass[]> {
    return this.activityService.getLeafClassesForSlug(slug);
  }

  @Post('slug/:slug/calculate-total')
  async calculateTotal(
    @Param('slug') slug: string,
    @Body() dto: CalculateEntriesDto,
  ) {
    return this.activityService.calculateEntriesTotalForSlug(slug, dto.entries);
  }

  @Post('slug/:slug/register')
  @UseGuards(JwtAuthGuard)
  async register(
    @Param('slug') slug: string,
    @Body() dto: CreateActivityRegistrationDto,
    @Request() req: { user: { id: number } },
  ) {
    const result = await this.activityService.createRegistrationForSlug(
      slug,
      dto,
      req.user.id,
    );
    return result;
  }
}
