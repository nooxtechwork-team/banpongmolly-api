import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Request,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { User } from '../entities/user.entity';
import { CheckInService } from './check-in.service';

@Controller('my/check-in')
@UseGuards(JwtAuthGuard)
@UseInterceptors(ResponseInterceptor)
export class MyCheckInController {
  constructor(private readonly checkInService: CheckInService) {}

  @Get('activities')
  async listActivities(@Request() req: { user: User }) {
    return this.checkInService.listMyCheckInActivities(req.user.id);
  }

  @Post('preview')
  async previewScan(
    @Request() req: { user: User },
    @Body('code') code?: string,
    @Body('latitude') latitude?: number,
    @Body('longitude') longitude?: number,
  ) {
    const coords =
      latitude != null && longitude != null
        ? { latitude: Number(latitude), longitude: Number(longitude) }
        : undefined;
    return this.checkInService.previewSelfCheckIn(req.user.id, code ?? '', coords);
  }

  @Post('confirm')
  async confirmScan(
    @Request() req: { user: User },
    @Body('code') code?: string,
    @Body('latitude') latitude?: number,
    @Body('longitude') longitude?: number,
  ) {
    const coords =
      latitude != null && longitude != null
        ? { latitude: Number(latitude), longitude: Number(longitude) }
        : undefined;
    return this.checkInService.confirmSelfCheckIn(req.user.id, code ?? '', coords);
  }

  @Post('activities/:activityId/scan')
  async scanActivityQr(
    @Request() req: { user: User },
    @Param('activityId', ParseIntPipe) activityId: number,
    @Body('code') code?: string,
    @Body('latitude') latitude?: number,
    @Body('longitude') longitude?: number,
  ) {
    const coords =
      latitude != null && longitude != null
        ? { latitude: Number(latitude), longitude: Number(longitude) }
        : undefined;
    return this.checkInService.submitSelfCheckIn(
      req.user.id,
      activityId,
      code ?? '',
      coords,
    );
  }
}
