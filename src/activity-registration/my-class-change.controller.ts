import {
  Controller,
  Get,
  Query,
  Request,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { User } from '../entities/user.entity';
import { ActivityRegistrationService } from './activity-registration.service';

@Controller('my/class-change')
@UseGuards(JwtAuthGuard)
@UseInterceptors(ResponseInterceptor)
export class MyClassChangeController {
  constructor(
    private readonly activityRegistrationService: ActivityRegistrationService,
  ) {}

  @Get('activities')
  async listActivities(@Request() req: { user: User }) {
    return this.activityRegistrationService.listActivitiesForClassChange({
      userId: req.user.id,
      isAdmin: false,
    });
  }

  @Get('lookup')
  async lookup(
    @Request() req: { user: User },
    @Query('activity_id') activityId?: string,
    @Query('q') q?: string,
  ) {
    return this.activityRegistrationService.lookupForClassChange(q ?? '', {
      userId: req.user.id,
      isAdmin: false,
      activityId: Number(activityId),
    });
  }
}
