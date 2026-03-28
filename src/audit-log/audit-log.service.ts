import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AuditLog,
  type AuditAction,
  type AuditEntityType,
} from '../entities/audit-log.entity';
import { User } from '../entities/user.entity';

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
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
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
  }): Promise<{
    items: {
      id: number;
      action: AuditAction;
      entity_type: AuditEntityType;
      entity_id: number;
      checker_user_id: number | null;
      checker_name: string | null;
      checker_email: string | null;
      checker_role: string | null;
      checked_at: Date | null;
      metadata: Record<string, unknown> | null;
      created_at: Date;
    }[];
    total: number;
  }> {
    const rawPage = params.page ?? 1;
    const rawLimit = params.limit ?? 20;
    const page = Math.max(
      1,
      typeof rawPage === 'number' && Number.isFinite(rawPage) ? rawPage : 1,
    );
    const limit = Math.min(
      100,
      Math.max(
        1,
        typeof rawLimit === 'number' && Number.isFinite(rawLimit) ? rawLimit : 20,
      ),
    );

    const applyFilters = (
      qb: ReturnType<Repository<AuditLog>['createQueryBuilder']>,
    ) => {
      if (params.action) {
        qb.andWhere('log.action = :action', { action: params.action });
      }
      if (params.entity_type) {
        qb.andWhere('log.entity_type = :entity_type', {
          entity_type: params.entity_type,
        });
      }
      if (params.from) {
        qb.andWhere('log.checked_at >= :from', { from: params.from });
      }
      if (params.to) {
        qb.andWhere('log.checked_at <= :to', { to: params.to });
      }
      return qb;
    };

    const total = await applyFilters(
      this.repo.createQueryBuilder('log'),
    ).getCount();

    const qb = applyFilters(
      this.repo
        .createQueryBuilder('log')
        .leftJoin(User, 'user', 'user.id = log.checker_user_id')
        .select([
          'log.id AS id',
          'log.action AS action',
          'log.entity_type AS entity_type',
          'log.entity_id AS entity_id',
          'log.checker_user_id AS checker_user_id',
          'log.checker_name AS checker_name',
          'log.checked_at AS checked_at',
          'log.metadata AS metadata',
          'log.created_at AS created_at',
          'user.email AS checker_email',
          'user.fullname AS user_fullname',
          'user.role AS checker_role',
        ])
        .orderBy('log.created_at', 'DESC'),
    );

    const raws = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getRawMany();

    const items = raws.map((r: any) => ({
      id: r.id as number,
      action: r.action as AuditAction,
      entity_type: r.entity_type as AuditEntityType,
      entity_id: r.entity_id as number,
      checker_user_id: (r.checker_user_id as number) ?? null,
      checker_name:
        (r.user_fullname as string) ?? (r.checker_name as string) ?? null,
      checker_email: (r.checker_email as string) ?? null,
      checker_role: (r.checker_role as string) ?? null,
      checked_at: (r.checked_at as Date) ?? null,
      metadata: (r.metadata as Record<string, unknown>) ?? null,
      created_at: r.created_at as Date,
    }));

    return { items, total };
  }
}
