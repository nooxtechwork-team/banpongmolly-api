import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EntryPopupConfig } from '../entities/entry-popup-config.entity';
import { UpdateEntryPopupConfigDto } from './dto/update-entry-popup-config.dto';

export type EntryPopupPublicView = {
  enabled: boolean;
  content_version: number;
  audience: string;
  show_dismiss_checkbox: boolean;
  dismiss_on_close: boolean;
  reshow_after_days: number | null;
  image_url?: string | null;
  link_url?: string | null;
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
      return {
        enabled: false,
        content_version: version,
        audience,
        show_dismiss_checkbox: row?.show_dismiss_checkbox ?? false,
        dismiss_on_close: row?.dismiss_on_close ?? true,
        reshow_after_days: row?.reshow_after_days ?? null,
      };
    }

    const hasContent = !!row.image_url?.trim();
    if (!hasContent) {
      return {
        enabled: false,
        content_version: version,
        audience,
        show_dismiss_checkbox: row.show_dismiss_checkbox ?? false,
        dismiss_on_close: row.dismiss_on_close ?? true,
        reshow_after_days: row.reshow_after_days ?? null,
      };
    }

    return {
      enabled: true,
      content_version: version,
      audience,
      show_dismiss_checkbox: row.show_dismiss_checkbox ?? false,
      dismiss_on_close: row.dismiss_on_close ?? true,
      reshow_after_days: row.reshow_after_days ?? null,
      image_url: row.image_url,
      link_url: row.link_url,
    };
  }

  async upsertConfig(
    dto: UpdateEntryPopupConfigDto,
  ): Promise<EntryPopupConfig> {
    const existing = await this.getConfig();
    if (existing) {
      if (dto.enabled !== undefined) existing.enabled = dto.enabled;
      if (dto.image_url !== undefined) existing.image_url = dto.image_url;
      if (dto.link_url !== undefined) existing.link_url = dto.link_url;
      if (dto.audience !== undefined) existing.audience = dto.audience;
      if (dto.show_dismiss_checkbox !== undefined) {
        existing.show_dismiss_checkbox = dto.show_dismiss_checkbox;
      }
      if (dto.dismiss_on_close !== undefined) {
        existing.dismiss_on_close = dto.dismiss_on_close;
      }
      if (dto.reshow_after_days !== undefined) {
        existing.reshow_after_days = dto.reshow_after_days;
      }
      existing.content_version = (existing.content_version ?? 0) + 1;
      return this.repo.save(existing);
    }

    const created = this.repo.create({
      enabled: dto.enabled ?? false,
      image_url: dto.image_url ?? null,
      link_url: dto.link_url ?? null,
      audience: dto.audience ?? 'all',
      show_dismiss_checkbox: dto.show_dismiss_checkbox ?? false,
      dismiss_on_close: dto.dismiss_on_close ?? true,
      reshow_after_days: dto.reshow_after_days ?? null,
      content_version: 1,
    });
    return this.repo.save(created);
  }
}
