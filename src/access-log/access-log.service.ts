import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
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

/** Columns needed for admin list — omit heavy JSON blobs not shown in the table */
const LIST_SELECT = [
  'log.id',
  'log.method',
  'log.path',
  'log.status_code',
  'log.duration_ms',
  'log.ip',
  'log.user_agent',
  'log.user_id',
  'log.user_email',
  'log.request_query',
  'log.request_body',
  'log.created_at',
] as const;

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

  private applyFilters(
    qb: SelectQueryBuilder<AccessLog>,
    params: {
      method?: string;
      status_code?: number;
      user_id?: number;
      path?: string;
      from?: string;
      to?: string;
    },
  ): SelectQueryBuilder<AccessLog> {
    if (params.method) {
      qb.andWhere('log.method = :method', { method: params.method });
    }
    if (params.status_code != null && Number.isFinite(params.status_code)) {
      qb.andWhere('log.status_code = :status', {
        status: params.status_code,
      });
    }
    if (params.user_id != null && Number.isFinite(params.user_id)) {
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
    return qb;
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
    const offset = (page - 1) * limit;

    const filterParams = {
      method: params.method,
      status_code: params.status_code,
      user_id: params.user_id,
      path: params.path,
      from: params.from,
      to: params.to,
    };

    const baseQb = this.applyFilters(
      this.repo.createQueryBuilder('log'),
      filterParams,
    );

    const [idRows, total] = await Promise.all([
      this.applyFilters(
        this.repo.createQueryBuilder('log'),
        filterParams,
      )
        .select('log.id', 'id')
        .orderBy('log.created_at', 'DESC')
        .addOrderBy('log.id', 'DESC')
        .offset(offset)
        .limit(limit)
        .getRawMany<{ id: number }>(),
      baseQb.clone().getCount(),
    ]);

    const ids = idRows
      .map((row) => Number(row.id))
      .filter((id) => Number.isFinite(id));

    if (ids.length === 0) {
      return { items: [], total };
    }

    const items = await this.repo
      .createQueryBuilder('log')
      .select([...LIST_SELECT])
      .where('log.id IN (:...ids)', { ids })
      .orderBy('log.created_at', 'DESC')
      .addOrderBy('log.id', 'DESC')
      .getMany();

    return { items, total };
  }
}
