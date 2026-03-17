import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccessLog } from '../entities/access-log.entity';

export interface CreateAccessLogDto {
  method: string;
  path: string;
  status_code: number;
  duration_ms: number;
  ip?: string | null;
  user_agent?: string | null;
  user_id?: number | null;
  user_email?: string | null;
  request_headers?: Record<string, unknown> | null;
  request_query?: Record<string, unknown> | null;
  request_body?: Record<string, unknown> | null;
  response_headers?: Record<string, unknown> | null;
}

@Injectable()
export class AccessLogService {
  constructor(
    @InjectRepository(AccessLog)
    private readonly repo: Repository<AccessLog>,
  ) {}

  async create(dto: CreateAccessLogDto): Promise<void> {
    const log = this.repo.create({
      method: dto.method,
      path: dto.path,
      status_code: dto.status_code,
      duration_ms: dto.duration_ms,
      ip: dto.ip ?? null,
      user_agent: dto.user_agent ?? null,
      user_id: dto.user_id ?? null,
      user_email: dto.user_email ?? null,
      request_headers: dto.request_headers ?? null,
      request_query: dto.request_query ?? null,
      request_body: dto.request_body ?? null,
      response_headers: dto.response_headers ?? null,
    });
    await this.repo.save(log);
  }

  async findList(params: {
    page?: number;
    limit?: number;
    method?: string;
    status_code?: number;
    user_id?: number;
    path?: string;
    from?: string;
    to?: string;
  }): Promise<{
    items: AccessLog[];
    total: number;
  }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));

    const qb = this.repo
      .createQueryBuilder('log')
      .orderBy('log.created_at', 'DESC');

    if (params.method) {
      qb.andWhere('log.method = :method', { method: params.method });
    }
    if (params.status_code) {
      qb.andWhere('log.status_code = :status', { status: params.status_code });
    }
    if (params.user_id) {
      qb.andWhere('log.user_id = :user_id', { user_id: params.user_id });
    }
    if (params.path) {
      qb.andWhere('log.path LIKE :path', { path: `%${params.path}%` });
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
