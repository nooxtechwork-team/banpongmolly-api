import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { User } from '../entities/user.entity';
import { Activity } from '../entities/activity.entity';
import {
  ActivityLeafClass,
  ActivityService,
  ActivityPublicDetail,
} from './activity.service';
import { CalculateEntriesDto } from './dto/calculate-entries.dto';
import { CreateActivityRegistrationDto } from './dto/create-activity-registration.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActivityFavoriteService } from './activity-favorite.service';

@Controller('activities')
export class PublicActivityController {
  constructor(
    private readonly activityService: ActivityService,
    private readonly activityFavoriteService: ActivityFavoriteService,
  ) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: 'open' | 'upcoming' | 'finished',
    @Query('search') search?: string,
    @Query('sort') sort?: 'upcoming' | 'latest' | 'oldest',
    @Query('province_id') provinceId?: string,
    @Query('sponsor_only') sponsorOnly?: string,
  ): Promise<{ items: Activity[]; total: number } | Activity[]> {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
    const limitNum = limit
      ? Math.min(100, Math.max(1, parseInt(limit, 10) || 10))
      : 10;

    const province_id =
      provinceId && !Number.isNaN(parseInt(provinceId, 10))
        ? parseInt(provinceId, 10)
        : undefined;

    const sponsor_only =
      sponsorOnly === 'true' || sponsorOnly === '1' || sponsorOnly === 'yes';

    return this.activityService.findPublicPaginated(pageNum, limitNum, {
      status,
      search,
      sort,
      province_id,
      sponsor_only,
    });
  }

  @Get('featured/homepage')
  async listFeaturedForHomepage() {
    return this.activityService.listFeaturedForHomepage();
  }

  @Get('favorites/me/ids')
  @UseGuards(JwtAuthGuard)
  async listMyFavoriteIds(
    @Request() req: ExpressRequest & { user: User },
  ): Promise<{ activity_ids: number[] }> {
    const activity_ids =
      await this.activityFavoriteService.listActivityIdsForUser(req.user.id);
    return { activity_ids };
  }

  @Get('favorites/me')
  @UseGuards(JwtAuthGuard)
  async listMyFavorites(
    @Request() req: ExpressRequest & { user: User },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: 'open' | 'upcoming' | 'finished',
    @Query('search') search?: string,
    @Query('sort') sort?: 'upcoming' | 'latest' | 'oldest',
    @Query('province_id') provinceId?: string,
  ): Promise<{ items: Activity[]; total: number }> {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
    const limitNum = limit
      ? Math.min(100, Math.max(1, parseInt(limit, 10) || 10))
      : 10;

    const province_id =
      provinceId && !Number.isNaN(parseInt(provinceId, 10))
        ? parseInt(provinceId, 10)
        : undefined;

    return this.activityFavoriteService.findPublicPaginatedForUser(
      req.user.id,
      pageNum,
      limitNum,
      {
        status,
        search,
        sort,
        province_id,
      },
    );
  }

  @Post(':activityId/favorite')
  @UseGuards(JwtAuthGuard)
  async addFavorite(
    @Param('activityId', ParseIntPipe) activityId: number,
    @Request() req: ExpressRequest & { user: User },
  ) {
    return this.activityFavoriteService.add(req.user.id, activityId);
  }

  @Delete(':activityId/favorite')
  @UseGuards(JwtAuthGuard)
  async removeFavorite(
    @Param('activityId', ParseIntPipe) activityId: number,
    @Request() req: ExpressRequest & { user: User },
  ) {
    return this.activityFavoriteService.remove(req.user.id, activityId);
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
    @Request() req: ExpressRequest & { user: User },
  ) {
    const ipHeader =
      (req.headers?.['x-forwarded-for'] as string | undefined) || '';
    const clientIp = ipHeader.split(',')[0]?.trim() || req.ip || null;
    const userAgent =
      (req.headers?.['user-agent'] as string | undefined) || null;
    const result = await this.activityService.createRegistrationForSlug(
      slug,
      dto,
      req.user.id,
      {
        ip: typeof clientIp === 'string' ? clientIp : null,
        userAgent,
      },
    );
    return result;
  }
}
