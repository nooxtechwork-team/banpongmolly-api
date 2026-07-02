import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ActivityRegistrationService } from './activity-registration.service';
import { ChangeRegistrationClassDto } from './dto/change-registration-class.dto';
import { User } from '../entities/user.entity';

@Controller('admin/activity-registrations')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ActivityRegistrationController {
  constructor(
    private readonly activityRegistrationService: ActivityRegistrationService,
  ) {}

  @Post(':id/change-class')
  async changeClass(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeRegistrationClassDto,
  ) {
    return this.activityRegistrationService.changeClass(id, dto, req.user.id);
  }
}
