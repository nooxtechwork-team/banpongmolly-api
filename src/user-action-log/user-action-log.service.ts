import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  UserActionLog,
  type UserActionType,
  type UserActionEntityType,
} from '../entities/user-action-log.entity';

export interface CreateUserActionLogDto {
  user_id?: number | null;
  email?: string | null;
  phone?: string | null;
  action: UserActionType;
  entity_type: UserActionEntityType;
  entity_id?: number | null;
  ip?: string | null;
  user_agent?: string | null;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class UserActionLogService {
  constructor(
    @InjectRepository(UserActionLog)
    private readonly repo: Repository<UserActionLog>,
  ) {}

  async create(dto: CreateUserActionLogDto): Promise<void> {
    const log = this.repo.create({
      user_id: dto.user_id ?? null,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      action: dto.action,
      entity_type: dto.entity_type,
      entity_id: dto.entity_id ?? null,
      ip: dto.ip ?? null,
      user_agent: dto.user_agent ?? null,
      metadata: dto.metadata ?? null,
    });
    await this.repo.save(log);
  }

  async findList(params: {
    page?: number;
    limit?: number;
    action?: UserActionType | '';
    entity_type?: UserActionEntityType | '';
    email?: string;
    user_id?: number;
    from?: string;
    to?: string;
  }): Promise<{ items: UserActionLog[]; total: number }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));

    const qb = this.repo
      .createQueryBuilder('log')
      .orderBy('log.created_at', 'DESC');

    if (params.action) {
      qb.andWhere('log.action = :action', { action: params.action });
    }
    if (params.entity_type) {
      qb.andWhere('log.entity_type = :entity_type', {
        entity_type: params.entity_type,
      });
    }
    if (params.email) {
      qb.andWhere('log.email LIKE :email', { email: `%${params.email}%` });
    }
    if (params.user_id) {
      qb.andWhere('log.user_id = :user_id', { user_id: params.user_id });
    }
    if (params.from) {
      qb.andWhere('log.created_at >= :from', { from: params.from });
    }
    if (params.to) {
      qb.andWhere('log.created_at <= :to', { to: params.to });
    }

    const [items, total] = await Promise.all([
      qb
        .clone()
        .skip((page - 1) * limit)
        .take(limit)
        .getMany(),
      qb.clone().getCount(),
    ]);

    return { items, total };
  }
}
