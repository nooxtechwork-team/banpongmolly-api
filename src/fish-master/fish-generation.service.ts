import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FishGeneration } from '../entities/fish-generation.entity';
import {
  CreateFishLookupDto,
  UpdateFishLookupDto,
} from './dto/fish-lookup.dto';

const DEFAULT_GENERATIONS: Array<
  Pick<FishGeneration, 'code' | 'label' | 'sort_order' | 'is_active'>
> = [
  {
    code: 'senior',
    label: 'ซีเนียร์',
    sort_order: 1,
    is_active: true,
  },
  {
    code: 'junior',
    label: 'จูเนียร์',
    sort_order: 2,
    is_active: true,
  },
];

@Injectable()
export class FishGenerationService implements OnModuleInit {
  constructor(
    @InjectRepository(FishGeneration)
    private readonly repo: Repository<FishGeneration>,
  ) {}

  async onModuleInit() {
    await this.seedIfEmpty();
  }

  private async seedIfEmpty() {
    try {
      const count = await this.repo.count();
      if (count > 0) return;
      await this.repo.insert(DEFAULT_GENERATIONS);
    } catch {
      // table may not exist yet
    }
  }

  async listPublic(): Promise<FishGeneration[]> {
    return this.repo.find({
      where: { is_active: true },
      order: { sort_order: 'ASC', id: 'ASC' },
    });
  }

  async listAdmin(): Promise<FishGeneration[]> {
    return this.repo.find({
      order: { sort_order: 'ASC', id: 'ASC' },
    });
  }

  async findById(id: number): Promise<FishGeneration | null> {
    return this.repo.findOne({ where: { id } });
  }

  async create(dto: CreateFishLookupDto): Promise<FishGeneration> {
    const code = dto.code.trim().toLowerCase();
    const existing = await this.repo.findOne({ where: { code } });
    if (existing) {
      throw new ConflictException(`รหัสรุ่น "${code}" มีอยู่แล้ว`);
    }
    const row = this.repo.create({
      code,
      label: dto.label.trim(),
      sort_order: dto.sort_order ?? 0,
      is_active: dto.is_active ?? true,
    });
    return this.repo.save(row);
  }

  async update(id: number, dto: UpdateFishLookupDto): Promise<FishGeneration> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('ไม่พบรุ่น');
    if (dto.label !== undefined) row.label = dto.label.trim();
    if (dto.sort_order !== undefined) row.sort_order = dto.sort_order;
    if (dto.is_active !== undefined) row.is_active = dto.is_active;
    return this.repo.save(row);
  }

  async remove(id: number): Promise<void> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('ไม่พบรุ่น');
    await this.repo.remove(row);
  }
}
