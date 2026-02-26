import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CheckInService } from './check-in.service';

@Controller('admin/check-in')
@UseGuards(JwtAuthGuard, AdminGuard)
export class CheckInController {
  constructor(private readonly checkInService: CheckInService) {}

  @Get('lookup')
  async lookup(
    @Query('code') code?: string,
  ): Promise<Awaited<ReturnType<CheckInService['lookup']>>> {
    return this.checkInService.lookup(code ?? '');
  }

  @Post('submit')
  async submit(
    @Body('registration_id') registrationId?: number,
  ): Promise<{ checked_in_at: string }> {
    const id =
      typeof registrationId === 'number' && Number.isFinite(registrationId)
        ? registrationId
        : undefined;
    if (id == null) {
      throw new BadRequestException('กรุณาระบุ registration_id');
    }
    return this.checkInService.submit(id);
  }

  @Get('history')
  async history(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('date_from') date_from?: string,
    @Query('date_to') date_to?: string,
  ): Promise<{
    items: Awaited<ReturnType<CheckInService['getHistory']>>['items'];
    total: number;
  }> {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
    const limitNum = limit
      ? Math.min(100, Math.max(1, parseInt(limit, 10) || 20))
      : 20;
    return this.checkInService.getHistory(pageNum, limitNum, {
      date_from: date_from || undefined,
      date_to: date_to || undefined,
    });
  }

  @Get('stats')
  async stats(): Promise<Awaited<ReturnType<CheckInService['getStats']>>> {
    return this.checkInService.getStats();
  }
}
