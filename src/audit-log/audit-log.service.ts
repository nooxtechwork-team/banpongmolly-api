import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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

    // ไม่ใช้ leftJoin + getRawMany — ใน TypeORM บางเคส LIMIT/OFFSET ไม่ถูกใส่ใน SQL ทำให้ได้ทุกแถว
    const listQb = applyFilters(
      this.repo.createQueryBuilder('log').orderBy('log.created_at', 'DESC'),
    );

    const [entities, total] = await listQb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const checkerIds = [
      ...new Set(
        entities
          .map((e) => e.checker_user_id)
          .filter((id): id is number => id != null),
      ),
    ];
    const users =
      checkerIds.length > 0
        ? await this.userRepo.find({
            where: { id: In(checkerIds) },
            select: ['id', 'email', 'fullname', 'role'],
          })
        : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    const items = entities.map((log) => {
      const u =
        log.checker_user_id != null
          ? userById.get(log.checker_user_id)
          : undefined;
      return {
        id: log.id,
        action: log.action,
        entity_type: log.entity_type,
        entity_id: log.entity_id,
        checker_user_id: log.checker_user_id,
        checker_name: u?.fullname ?? log.checker_name ?? null,
        checker_email: u?.email ?? null,
        checker_role: u?.role != null ? String(u.role) : null,
        checked_at: log.checked_at,
        metadata: log.metadata,
        created_at: log.created_at,
      };
    });

    return { items, total };
  }
}
