import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { HeroBannerSlide } from '../entities/hero-banner-slide.entity';
import { CreateHeroBannerSlideDto } from './dto/create-hero-banner-slide.dto';
import { UpdateHeroBannerSlideDto } from './dto/update-hero-banner-slide.dto';

export type HeroBannerSlidePublicView = {
  id: number;
  image_url: string;
  image_url_mobile: string | null;
  link_url: string | null;
  alt: string | null;
};

@Injectable()
export class HeroBannerService {
  constructor(
    @InjectRepository(HeroBannerSlide)
    private readonly repo: Repository<HeroBannerSlide>,
  ) {}

  private mapPublic(row: HeroBannerSlide): HeroBannerSlidePublicView {
    return {
      id: row.id,
      image_url: row.image_url,
      image_url_mobile: row.image_url_mobile,
      link_url: row.link_url,
      alt: row.alt,
    };
  }

  async listPublic(): Promise<HeroBannerSlidePublicView[]> {
    const rows = await this.repo.find({
      where: { is_enabled: true },
      order: { sort_order: 'ASC', id: 'ASC' },
    });
    return rows
      .filter((row) => !!row.image_url?.trim())
      .map((row) => this.mapPublic(row));
  }

  async listAdmin(): Promise<HeroBannerSlide[]> {
    return this.repo.find({
      order: { sort_order: 'ASC', id: 'ASC' },
    });
  }

  async findOneById(id: number): Promise<HeroBannerSlide> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('ไม่พบสไลด์แบนเนอร์นี้');
    }
    return row;
  }

  async create(dto: CreateHeroBannerSlideDto): Promise<HeroBannerSlide> {
    const imageUrl = dto.image_url?.trim();
    if (!imageUrl) {
      throw new BadRequestException('กรุณาอัปโหลดรูปแบนเนอร์');
    }

    const maxOrder = await this.repo
      .createQueryBuilder('slide')
      .select('MAX(slide.sort_order)', 'max')
      .getRawOne<{ max: string | null }>();

    const nextOrder = (Number(maxOrder?.max) || 0) + 1;

    const created = this.repo.create({
      image_url: imageUrl,
      image_url_mobile: dto.image_url_mobile?.trim() || null,
      link_url: dto.link_url?.trim() || null,
      alt: dto.alt?.trim() || null,
      is_enabled: dto.is_enabled ?? true,
      sort_order: nextOrder,
    });
    return this.repo.save(created);
  }

  async update(
    id: number,
    dto: UpdateHeroBannerSlideDto,
  ): Promise<HeroBannerSlide> {
    const row = await this.findOneById(id);

    if (dto.image_url !== undefined) {
      const imageUrl = dto.image_url.trim();
      if (!imageUrl) {
        throw new BadRequestException('กรุณาอัปโหลดรูปแบนเนอร์');
      }
      row.image_url = imageUrl;
    }
    if (dto.image_url_mobile !== undefined) {
      row.image_url_mobile = dto.image_url_mobile?.trim() || null;
    }
    if (dto.link_url !== undefined) {
      row.link_url = dto.link_url.trim() || null;
    }
    if (dto.alt !== undefined) {
      row.alt = dto.alt.trim() || null;
    }
    if (dto.is_enabled !== undefined) {
      row.is_enabled = dto.is_enabled;
    }

    return this.repo.save(row);
  }

  async remove(id: number): Promise<void> {
    const row = await this.findOneById(id);
    await this.repo.remove(row);
  }

  async reorder(ids: number[]): Promise<HeroBannerSlide[]> {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) {
      throw new BadRequestException('กรุณาระบุลำดับสไลด์');
    }

    const rows = await this.repo.find({ where: { id: In(uniqueIds) } });
    if (rows.length !== uniqueIds.length) {
      throw new BadRequestException('พบสไลด์ที่ไม่ถูกต้องในรายการจัดลำดับ');
    }

    const orderMap = new Map(uniqueIds.map((id, index) => [id, index + 1]));
    for (const row of rows) {
      row.sort_order = orderMap.get(row.id) ?? row.sort_order;
    }
    await this.repo.save(rows);
    return this.listAdmin();
  }
}
