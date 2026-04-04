import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ActivityService } from './activity.service';
import {
  ActivityRewardService,
  ActivityRewardDto,
} from './activity-reward.service';
import { ActivityTagService, ActivityTagDto } from './activity-tag.service';
import { ActivityStatus } from '../entities/activity.entity';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { UpsertActivityRewardsDto } from './dto/upsert-activity-rewards.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { Audit } from '../common/decorators/audit.decorator';
import { Activity } from '../entities/activity.entity';
import { CheckOutService } from '../order/check-out.service';

@Controller('admin/activities')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ActivityController {
  constructor(
    private readonly activityService: ActivityService,
    private readonly activityRewardService: ActivityRewardService,
    private readonly activityTagService: ActivityTagService,
    private readonly checkOutService: CheckOutService,
  ) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: ActivityStatus,
    @Query('search') search?: string,
  ): Promise<{ items: Activity[]; total: number } | Activity[]> {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : undefined;
    const limitNum = limit
      ? Math.min(100, Math.max(1, parseInt(limit, 10) || 10))
      : undefined;
    if (pageNum !== undefined && limitNum !== undefined) {
      return this.activityService.findPaginated(pageNum, limitNum, {
        status,
        search,
      });
    }
    return this.activityService.findAll();
  }

  @Get(':id/rewards')
  async getRewards(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ActivityRewardDto[]> {
    await this.activityService.findOne(id);
    return this.activityRewardService.findByActivityId(id);
  }

  @Get(':id/tags')
  async getTags(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ActivityTagDto[]> {
    await this.activityService.findOne(id);
    return this.activityTagService.getTagsForActivity(id);
  }

  /** รายการรหัสปลา (entry) จากใบสมัครที่ชำระเงินแล้ว — ใช้ autocomplete หน้า competition dashboard */
  @Get(':id/competition-entry-picklist')
  async competitionEntryPicklist(@Param('id', ParseIntPipe) id: number) {
    await this.activityService.findOne(id);
    return this.checkOutService.listCompetitionEntryPicklist(id);
  }

  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number): Promise<Activity> {
    return this.activityService.findOne(id);
  }

  @Get(':id/sponsor-packages')
  async getSponsorPackages(@Param('id', ParseIntPipe) id: number) {
    await this.activityService.findOne(id);
    return this.activityService.getSponsorPackagesForActivity(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Audit({
    action: 'create',
    entity_type: 'activity',
    entityIdSource: 'result:id',
  })
  async create(@Body() dto: CreateActivityDto): Promise<Activity> {
    return this.activityService.create(dto);
  }

  @Patch(':id/rewards')
  @Audit({
    action: 'edit',
    entity_type: 'activity',
    entityIdSource: 'param:id',
  })
  async setRewards(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertActivityRewardsDto,
  ): Promise<ActivityRewardDto[]> {
    await this.activityService.findOne(id);
    return this.activityRewardService.setRewards(id, dto.rewards ?? []);
  }

  @Patch(':id')
  @Audit({
    action: 'edit',
    entity_type: 'activity',
    entityIdSource: 'param:id',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateActivityDto,
  ): Promise<Activity> {
    return this.activityService.update(id, dto);
  }

  @Post(':id/feature-homepage')
  @Audit({
    action: 'edit',
    entity_type: 'activity',
    entityIdSource: 'param:id',
  })
  async setFeaturedHomepage(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { featured: boolean },
  ): Promise<Activity> {
    return this.activityService.setHomepageFeatured(id, !!body.featured);
  }

  @Patch(':id/sponsor-packages')
  @Audit({
    action: 'edit',
    entity_type: 'activity',
    entityIdSource: 'param:id',
  })
  async setSponsorPackages(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      package_ids: number[];
    },
  ) {
    await this.activityService.setSponsorPackagesForActivity(
      id,
      body?.package_ids ?? [],
    );
    return this.activityService.getSponsorPackagesForActivity(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({
    action: 'delete',
    entity_type: 'activity',
    entityIdSource: 'param:id',
  })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.activityService.softDelete(id);
  }
}
