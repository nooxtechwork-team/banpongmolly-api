import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, type AuditAction, type AuditEntityType } from '../entities/audit-log.entity';

export interface CreateAuditLogDto {
  action: AuditAction;
  entity_type: AuditEntityType;
  entity_id: number;
  checker_user_id?: number | null;
  checker_name?: string | null;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async create(dto: CreateAuditLogDto): Promise<AuditLog> {
    const log = this.repo.create({
      action: dto.action,
      entity_type: dto.entity_type,
      entity_id: dto.entity_id,
      checker_user_id: dto.checker_user_id ?? null,
      checker_name: dto.checker_name ?? null,
      checked_at: new Date(),
      metadata: dto.metadata ?? null,
    });
    return this.repo.save(log);
  }

  async findList(params: {
    page?: number;
    limit?: number;
    action?: AuditAction;
    entity_type?: AuditEntityType;
    from?: string;
    to?: string;
  }): Promise<{ items: AuditLog[]; total: number }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const qb = this.repo.createQueryBuilder('log').orderBy('log.created_at', 'DESC');

    if (params.action) {
      qb.andWhere('log.action = :action', { action: params.action });
    }
    if (params.entity_type) {
      qb.andWhere('log.entity_type = :entity_type', { entity_type: params.entity_type });
    }
    if (params.from) {
      qb.andWhere('log.checked_at >= :from', { from: params.from });
    }
    if (params.to) {
      qb.andWhere('log.checked_at <= :to', { to: params.to });
    }

    const [items, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return { items, total };
  }
}
