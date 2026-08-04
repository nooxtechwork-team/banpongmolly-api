import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FishGender } from '../entities/fish-gender.entity';
import {
  CreateFishLookupDto,
  UpdateFishLookupDto,
} from './dto/fish-lookup.dto';

const DEFAULT_GENDERS: Array<
  Pick<FishGender, 'code' | 'label' | 'sort_order' | 'is_active'>
> = [
  {
    code: 'male',
    label: 'ตัวผู้',
    sort_order: 1,
    is_active: true,
  },
  {
    code: 'female',
    label: 'ตัวเมีย',
    sort_order: 2,
    is_active: true,
  },
];

@Injectable()
export class FishGenderService implements OnModuleInit {
  constructor(
    @InjectRepository(FishGender)
    private readonly repo: Repository<FishGender>,
  ) {}

  async onModuleInit() {
    await this.seedIfEmpty();
  }

  private async seedIfEmpty() {
    try {
      const count = await this.repo.count();
      if (count > 0) return;
      await this.repo.insert(DEFAULT_GENDERS);
    } catch {
      // table may not exist yet
    }
  }

  async listPublic(): Promise<FishGender[]> {
    return this.repo.find({
      where: { is_active: true },
      order: { sort_order: 'ASC', id: 'ASC' },
    });
  }

  async listAdmin(): Promise<FishGender[]> {
    return this.repo.find({
      order: { sort_order: 'ASC', id: 'ASC' },
    });
  }

  async findById(id: number): Promise<FishGender | null> {
    return this.repo.findOne({ where: { id } });
  }

  async create(dto: CreateFishLookupDto): Promise<FishGender> {
    const code = dto.code.trim().toLowerCase();
    const existing = await this.repo.findOne({ where: { code } });
    if (existing) {
      throw new ConflictException(`รหัสเพศ "${code}" มีอยู่แล้ว`);
    }
    const row = this.repo.create({
      code,
      label: dto.label.trim(),
      sort_order: dto.sort_order ?? 0,
      is_active: dto.is_active ?? true,
    });
    return this.repo.save(row);
  }

  async update(id: number, dto: UpdateFishLookupDto): Promise<FishGender> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('ไม่พบเพศ');
    if (dto.label !== undefined) row.label = dto.label.trim();
    if (dto.sort_order !== undefined) row.sort_order = dto.sort_order;
    if (dto.is_active !== undefined) row.is_active = dto.is_active;
    return this.repo.save(row);
  }

  async remove(id: number): Promise<void> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('ไม่พบเพศ');
    await this.repo.remove(row);
  }
}
