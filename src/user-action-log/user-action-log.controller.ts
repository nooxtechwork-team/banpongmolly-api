import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import {
  UserActionLog,
  type UserActionType,
  type UserActionEntityType,
} from '../entities/user-action-log.entity';
import { UserActionLogService } from './user-action-log.service';

@Controller('admin/user-action-logs')
@UseGuards(JwtAuthGuard, AdminGuard)
export class UserActionLogController {
  constructor(private readonly userActionLogService: UserActionLogService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
    @Query('entity_type') entity_type?: string,
    @Query('email') email?: string,
    @Query('user_id') user_id?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<{ items: UserActionLog[]; total: number }> {
    return this.userActionLogService.findList({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      action: (action || undefined) as UserActionType | undefined,
      entity_type: (entity_type || undefined) as
        | UserActionEntityType
        | undefined,
      email: email || undefined,
      user_id: user_id ? parseInt(user_id, 10) : undefined,
      from,
      to,
    });
  }
}
