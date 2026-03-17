import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AccessLogService } from './access-log.service';
import { AccessLog } from '../entities/access-log.entity';

@Controller('admin/access-logs')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AccessLogController {
  constructor(private readonly accessLogService: AccessLogService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('method') method?: string,
    @Query('status_code') status_code?: string,
    @Query('user_id') user_id?: string,
    @Query('path') path?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<{ items: AccessLog[]; total: number }> {
    return this.accessLogService.findList({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      method: method || undefined,
      status_code: status_code ? parseInt(status_code, 10) : undefined,
      user_id: user_id ? parseInt(user_id, 10) : undefined,
      path: path || undefined,
      from,
      to,
    });
  }
}
