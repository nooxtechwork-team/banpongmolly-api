import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EntryPopupConfig } from '../entities/entry-popup-config.entity';
import { UpdateEntryPopupConfigDto } from './dto/update-entry-popup-config.dto';

export type EntryPopupPublicView = {
  enabled: boolean;
  content_version: number;
  audience: string;
  title?: string | null;
  body?: string | null;
  image_url?: string | null;
  button_label?: string | null;
  button_url?: string | null;
};

@Injectable()
export class EntryPopupService {
  constructor(
    @InjectRepository(EntryPopupConfig)
    private readonly repo: Repository<EntryPopupConfig>,
  ) {}

  async getConfig(): Promise<EntryPopupConfig | null> {
    const all = await this.repo.find({
      order: { id: 'ASC' },
      take: 1,
    });
    return all[0] ?? null;
  }

  getPublicView(): Promise<EntryPopupPublicView> {
    return this.buildPublicView();
  }

  private async buildPublicView(): Promise<EntryPopupPublicView> {
    const row = await this.getConfig();
    const version = row?.content_version ?? 0;
    const audience = row?.audience ?? 'all';

    if (!row || !row.enabled) {
      return { enabled: false, content_version: version, audience };
    }

    const hasContent = !!(
      row.title?.trim() ||
      row.body?.trim() ||
      row.image_url?.trim()
    );
    if (!hasContent) {
      return { enabled: false, content_version: version, audience };
    }

    return {
      enabled: true,
      content_version: version,
      audience,
      title: row.title,
      body: row.body,
      image_url: row.image_url,
      button_label: row.button_label,
      button_url: row.button_url,
    };
  }

  async upsertConfig(dto: UpdateEntryPopupConfigDto): Promise<EntryPopupConfig> {
    const existing = await this.getConfig();
    if (existing) {
      if (dto.enabled !== undefined) existing.enabled = dto.enabled;
      if (dto.title !== undefined) existing.title = dto.title;
      if (dto.body !== undefined) existing.body = dto.body;
      if (dto.image_url !== undefined) existing.image_url = dto.image_url;
      if (dto.button_label !== undefined) existing.button_label = dto.button_label;
      if (dto.button_url !== undefined) existing.button_url = dto.button_url;
      if (dto.audience !== undefined) existing.audience = dto.audience;
      existing.content_version = (existing.content_version ?? 0) + 1;
      return this.repo.save(existing);
    }

    const created = this.repo.create({
      enabled: dto.enabled ?? false,
      title: dto.title ?? null,
      body: dto.body ?? null,
      image_url: dto.image_url ?? null,
      button_label: dto.button_label ?? null,
      button_url: dto.button_url ?? null,
      audience: dto.audience ?? 'all',
      content_version: 1,
    });
    return this.repo.save(created);
  }
}
