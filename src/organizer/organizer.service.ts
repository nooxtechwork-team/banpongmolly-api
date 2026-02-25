import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Organizer } from '../entities/organizer.entity';
import { UploadService } from '../upload/upload.service';

const UPLOAD_SUBDIR = 'organizers' as const;

export interface UpsertOrganizerDto {
  name: string;
  slug: string;
  description?: string;
  logo_url?: string;
}

@Injectable()
export class OrganizerService {
  constructor(
    @InjectRepository(Organizer)
    private readonly organizerRepository: Repository<Organizer>,
    private readonly uploadService: UploadService,
  ) {}

  async findAll(): Promise<Organizer[]> {
    return this.organizerRepository.find({
      where: { deleted_at: IsNull() },
      order: { name: 'ASC' },
    });
  }

  async findPaginated(
    page: number = 1,
    limit: number = 10,
  ): Promise<{ items: Organizer[]; total: number }> {
    const where = { deleted_at: IsNull() };
    const [items, total] = await this.organizerRepository.findAndCount({
      where,
      order: { name: 'ASC' },
      skip: (page - 1) * limit,
      take: Math.min(Math.max(1, limit), 100),
    });
    return { items, total };
  }

  async findOne(id: number): Promise<Organizer> {
    const organizer = await this.organizerRepository.findOne({
      where: { id, deleted_at: IsNull() },
    });
    if (!organizer) {
      throw new NotFoundException('ไม่พบผู้จัดงาน');
    }
    return organizer;
  }

  async create(payload: UpsertOrganizerDto): Promise<Organizer> {
    const entity = this.organizerRepository.create({
      ...payload,
    });
    return this.organizerRepository.save(entity);
  }

  async update(
    id: number,
    payload: Partial<UpsertOrganizerDto>,
  ): Promise<Organizer> {
    const existing = await this.findOne(id);
    if (
      payload.logo_url !== undefined &&
      existing.logo_url &&
      existing.logo_url !== payload.logo_url
    ) {
      await this.uploadService.deleteByPath(existing.logo_url, {
        subdir: UPLOAD_SUBDIR,
      });
    }
    const merged = this.organizerRepository.merge(existing, payload);
    return this.organizerRepository.save(merged);
  }

  async softDelete(id: number): Promise<void> {
    const existing = await this.findOne(id);
    await this.uploadService.deleteByPath(existing.logo_url, {
      subdir: UPLOAD_SUBDIR,
    });
    existing.deleted_at = new Date();
    await this.organizerRepository.save(existing);
  }
}
