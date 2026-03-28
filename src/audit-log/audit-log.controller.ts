import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AuditLog } from '../entities/audit-log.entity';

@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
    @Query('entity_type') entity_type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<{ items: AuditLog[]; total: number }> {
    return this.auditLogService.findList({
      page:
        page !== undefined && page !== ''
          ? Number.parseInt(String(page), 10)
          : undefined,
      limit:
        limit !== undefined && limit !== ''
          ? Number.parseInt(String(limit), 10)
          : undefined,
      action: action as any,
      entity_type: entity_type as any,
      from,
      to,
    });
  }
}
