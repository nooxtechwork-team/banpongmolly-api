import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  LoginLog,
  type LoginProvider,
  type LoginStatus,
} from '../entities/login-log.entity';

export interface CreateLoginLogDto {
  user_id?: number | null;
  email?: string | null;
  provider: LoginProvider;
  status: LoginStatus;
  reason?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class LoginLogService {
  constructor(
    @InjectRepository(LoginLog)
    private readonly repo: Repository<LoginLog>,
  ) {}

  async create(dto: CreateLoginLogDto): Promise<void> {
    const log = this.repo.create({
      user_id: dto.user_id ?? null,
      email: dto.email ?? null,
      provider: dto.provider,
      status: dto.status,
      reason: dto.reason ?? null,
      ip: dto.ip ?? null,
      user_agent: dto.user_agent ?? null,
      metadata: dto.metadata ?? null,
    });
    await this.repo.save(log);
  }

  async findList(params: {
    page?: number;
    limit?: number;
    provider?: LoginProvider;
    status?: LoginStatus;
    email?: string;
    user_id?: number;
    from?: string;
    to?: string;
  }): Promise<{ items: LoginLog[]; total: number }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));

    const qb = this.repo
      .createQueryBuilder('log')
      .orderBy('log.created_at', 'DESC');

    if (params.provider) {
      qb.andWhere('log.provider = :provider', { provider: params.provider });
    }
    if (params.status) {
      qb.andWhere('log.status = :status', { status: params.status });
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

