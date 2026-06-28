import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SponsorTierLookup } from '../entities/sponsor-tier.entity';
import {
  CreateSponsorTierDto,
  UpdateSponsorTierDto,
} from './dto/sponsor-tier.dto';

const DEFAULT_TIERS: Array<
  Pick<
    SponsorTierLookup,
    'code' | 'label_th' | 'label_en' | 'color' | 'sort_order' | 'is_active'
  >
> = [
  {
    code: 'supporter',
    label_th: 'Supporter',
    label_en: 'Supporter',
    color: 'emerald',
    sort_order: 1,
    is_active: true,
  },
  {
    code: 'main',
    label_th: 'Main Sponsor',
    label_en: 'Main Sponsor',
    color: 'sky',
    sort_order: 2,
    is_active: true,
  },
  {
    code: 'premium',
    label_th: 'Premium Sponsor',
    label_en: 'Premium Sponsor',
    color: 'amber',
    sort_order: 3,
    is_active: true,
  },
];

@Injectable()
export class SponsorTierService implements OnModuleInit {
  constructor(
    @InjectRepository(SponsorTierLookup)
    private readonly repo: Repository<SponsorTierLookup>,
  ) {}

  async onModuleInit() {
    await this.seedIfEmpty();
  }

  private async seedIfEmpty() {
    try {
      const count = await this.repo.count();
      if (count > 0) return;
      await this.repo.insert(DEFAULT_TIERS);
    } catch {
      // table may not exist yet in some environments
    }
  }

  async listPublic(): Promise<SponsorTierLookup[]> {
    return this.repo.find({
      where: { is_active: true },
      order: { sort_order: 'ASC', id: 'ASC' },
    });
  }

  async listAdmin(): Promise<SponsorTierLookup[]> {
    return this.repo.find({
      order: { sort_order: 'ASC', id: 'ASC' },
    });
  }

  async create(dto: CreateSponsorTierDto): Promise<SponsorTierLookup> {
    const code = dto.code.trim().toLowerCase();
    const existing = await this.repo.findOne({ where: { code } });
    if (existing) {
      throw new ConflictException(`รหัส tier "${code}" มีอยู่แล้ว`);
    }
    const row = this.repo.create({
      code,
      label_th: dto.label_th.trim(),
      label_en: dto.label_en.trim(),
      color: dto.color?.trim() || 'slate',
      sort_order: dto.sort_order ?? 0,
      is_active: dto.is_active ?? true,
    });
    return this.repo.save(row);
  }

  async update(
    id: number,
    dto: UpdateSponsorTierDto,
  ): Promise<SponsorTierLookup> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('ไม่พบระดับสปอนเซอร์');
    if (dto.label_th !== undefined) row.label_th = dto.label_th.trim();
    if (dto.label_en !== undefined) row.label_en = dto.label_en.trim();
    if (dto.color !== undefined) row.color = dto.color.trim() || 'slate';
    if (dto.sort_order !== undefined) row.sort_order = dto.sort_order;
    if (dto.is_active !== undefined) row.is_active = dto.is_active;
    return this.repo.save(row);
  }

  async remove(id: number): Promise<void> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('ไม่พบระดับสปอนเซอร์');
    await this.repo.remove(row);
  }
}
