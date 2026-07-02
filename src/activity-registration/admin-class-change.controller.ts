import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ActivityRegistrationService } from './activity-registration.service';

@Controller('admin/class-change')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminClassChangeController {
  constructor(
    private readonly activityRegistrationService: ActivityRegistrationService,
  ) {}

  @Get('activities')
  async listActivities() {
    return this.activityRegistrationService.listActivitiesForClassChange({
      isAdmin: true,
    });
  }

  @Get('pending')
  async listPending(@Query('activity_id') activityId?: string) {
    return this.activityRegistrationService.listPendingClassChangesForAdmin(
      Number(activityId),
    );
  }

  @Get('lookup')
  async lookup(
    @Query('activity_id') activityId?: string,
    @Query('q') q?: string,
  ) {
    return this.activityRegistrationService.lookupForClassChange(q ?? '', {
      isAdmin: true,
      activityId: Number(activityId),
    });
  }

  @Get('logs')
  async listLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('activity_id') activityId?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.activityRegistrationService.listClassChangeLogsForAdmin({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      activity_id: activityId ? parseInt(activityId, 10) : undefined,
      q: q || undefined,
      from: from || undefined,
      to: to || undefined,
    });
  }
}
