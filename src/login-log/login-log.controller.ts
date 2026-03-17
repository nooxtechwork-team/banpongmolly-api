import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import {
  LoginLog,
  type LoginProvider,
  type LoginStatus,
} from '../entities/login-log.entity';
import { LoginLogService } from './login-log.service';

@Controller('admin/login-logs')
@UseGuards(JwtAuthGuard, AdminGuard)
export class LoginLogController {
  constructor(private readonly loginLogService: LoginLogService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('provider') provider?: string,
    @Query('status') status?: string,
    @Query('email') email?: string,
    @Query('user_id') user_id?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<{ items: LoginLog[]; total: number }> {
    return this.loginLogService.findList({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      provider: provider as LoginProvider | undefined,
      status: status as LoginStatus | undefined,
      email: email || undefined,
      user_id: user_id ? parseInt(user_id, 10) : undefined,
      from,
      to,
    });
  }
}

