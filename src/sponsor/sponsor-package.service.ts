import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SponsorPackage } from '../entities/sponsor-package.entity';

export interface SponsorPackageListParams {
  page?: number;
  limit?: number;
  search?: string;
  tier?: string;
  is_active?: boolean;
}

@Injectable()
export class SponsorPackageService {
  constructor(
    @InjectRepository(SponsorPackage)
    private readonly pkgRepo: Repository<SponsorPackage>,
  ) {}

  async listAdmin(
    params: SponsorPackageListParams,
  ): Promise<{ items: SponsorPackage[]; total: number }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));

    const qb = this.pkgRepo.createQueryBuilder('pkg');

    if (params.search?.trim()) {
      const q = `%${params.search.trim()}%`;
      qb.andWhere('(pkg.code LIKE :q OR pkg.name LIKE :q)', { q });
    }

    if (params.tier) {
      qb.andWhere('pkg.tier = :tier', { tier: params.tier });
    }

    if (typeof params.is_active === 'boolean') {
      qb.andWhere('pkg.is_active = :active', { active: params.is_active });
    }

    qb.orderBy('pkg.amount', 'ASC');

    const [items, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items, total };
  }

  async findOne(id: number): Promise<SponsorPackage> {
    return this.pkgRepo.findOneOrFail({ where: { id } });
  }

  async create(payload: {
    code: string;
    name: string;
    amount: number;
    tier: string;
    description?: string | null;
  }): Promise<SponsorPackage> {
    const entity = this.pkgRepo.create({
      code: payload.code,
      name: payload.name,
      amount: payload.amount,
      tier: payload.tier,
      description: payload.description ?? null,
      is_active: true,
    });
    return this.pkgRepo.save(entity);
  }

  async update(
    id: number,
    payload: Partial<{
      code: string;
      name: string;
      amount: number;
      tier: string;
      description: string | null;
      is_active: boolean;
    }>,
  ): Promise<SponsorPackage> {
    const entity = await this.findOne(id);
    Object.assign(entity, payload);
    return this.pkgRepo.save(entity);
  }

  async softDelete(id: number): Promise<void> {
    const entity = await this.findOne(id);
    entity.is_active = false;
    await this.pkgRepo.save(entity);
  }
}

