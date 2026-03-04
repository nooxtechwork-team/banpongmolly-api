import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { News, NewsCategory } from '../entities/news.entity';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';

@Injectable()
export class NewsService {
  constructor(
    @InjectRepository(News)
    private readonly newsRepo: Repository<News>,
  ) {}

  private generateSlug(title: string): string {
    const base = title
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9ก-๙-]+/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return base || `news-${Date.now()}`;
  }

  async create(dto: CreateNewsDto): Promise<News> {
    const entity = this.newsRepo.create();
    entity.title = dto.title.trim();
    entity.slug = (dto.slug || this.generateSlug(dto.title)).trim();
    entity.excerpt = dto.excerpt?.trim() || null;
    entity.content = dto.content;
    entity.category = dto.category ?? NewsCategory.NEWS;
    entity.thumbnail_url = dto.thumbnail_url?.trim() || null;
    entity.is_published = dto.is_published ?? false;
    entity.published_at =
      dto.published_at && entity.is_published
        ? new Date(dto.published_at)
        : null;
    return this.newsRepo.save(entity);
  }

  async update(id: number, dto: UpdateNewsDto): Promise<News> {
    const entity = await this.newsRepo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('ไม่พบบทความข่าวนี้');
    }
    if (dto.title !== undefined) {
      entity.title = dto.title.trim();
    }
    if (dto.slug !== undefined) {
      entity.slug = dto.slug.trim() || this.generateSlug(entity.title);
    }
    if (dto.excerpt !== undefined) {
      entity.excerpt = dto.excerpt.trim() || null;
    }
    if (dto.content !== undefined) {
      entity.content = dto.content;
    }
    if (dto.category !== undefined) {
      entity.category = dto.category;
    }
    if (dto.thumbnail_url !== undefined) {
      entity.thumbnail_url = dto.thumbnail_url.trim() || null;
    }
    if (dto.is_published !== undefined) {
      entity.is_published = dto.is_published;
    }
    if (dto.published_at !== undefined) {
      entity.published_at =
        dto.published_at && entity.is_published
          ? new Date(dto.published_at)
          : null;
    }
    return this.newsRepo.save(entity);
  }

  async remove(id: number): Promise<void> {
    const entity = await this.newsRepo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('ไม่พบบทความข่าวนี้');
    }
    await this.newsRepo.remove(entity);
  }

  async findOneById(id: number): Promise<News> {
    const entity = await this.newsRepo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('ไม่พบบทความข่าวนี้');
    }
    return entity;
  }

  async findOneBySlug(slug: string): Promise<News> {
    const entity = await this.newsRepo.findOne({
      where: { slug, is_published: true },
    });
    if (!entity) {
      throw new NotFoundException('ไม่พบบทความข่าวนี้');
    }
    return entity;
  }

  async listPublic(params: {
    page?: number;
    limit?: number;
    category?: NewsCategory | 'all';
    search?: string;
  }): Promise<{ items: News[]; total: number }> {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit =
      params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 20;

    const where: any = {
      is_published: true,
    };

    if (params.category && params.category !== 'all') {
      where.category = params.category;
    }

    if (params.search && params.search.trim()) {
      const q = params.search.trim();
      where.title = ILike(`%${q}%`);
    }

    const [items, total] = await this.newsRepo.findAndCount({
      where,
      order: {
        published_at: 'DESC',
        created_at: 'DESC',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, total };
  }

  async listAdmin(params: {
    page?: number;
    limit?: number;
    category?: NewsCategory | 'all';
    status?: 'published' | 'draft' | 'all';
    search?: string;
  }): Promise<{ items: News[]; total: number }> {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit =
      params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 20;

    const where: any = {};

    if (params.category && params.category !== 'all') {
      where.category = params.category;
    }

    if (params.status === 'published') {
      where.is_published = true;
    } else if (params.status === 'draft') {
      where.is_published = false;
    }

    if (params.search && params.search.trim()) {
      const q = params.search.trim();
      where.title = ILike(`%${q}%`);
    }

    const [items, total] = await this.newsRepo.findAndCount({
      where,
      order: {
        created_at: 'DESC',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, total };
  }
}
