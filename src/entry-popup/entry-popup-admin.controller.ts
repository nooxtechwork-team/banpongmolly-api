import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { EntryPopupService } from './entry-popup.service';
import { UpdateEntryPopupConfigDto } from './dto/update-entry-popup-config.dto';

@Controller('admin/entry-popup')
@UseGuards(JwtAuthGuard, AdminGuard)
export class EntryPopupAdminController {
  constructor(private readonly entryPopupService: EntryPopupService) {}

  @Get()
  async getConfig() {
    const row = await this.entryPopupService.getConfig();
    if (!row) {
      return {
        enabled: false,
        content_version: 0,
        image_url: null,
        link_url: null,
        audience: 'all',
        show_dismiss_checkbox: false,
        dismiss_on_close: true,
        reshow_after_days: null,
      };
    }
    return {
      enabled: row.enabled,
      content_version: row.content_version,
      image_url: row.image_url,
      link_url: row.link_url,
      audience: row.audience,
      show_dismiss_checkbox: row.show_dismiss_checkbox ?? false,
      dismiss_on_close: row.dismiss_on_close ?? true,
      reshow_after_days: row.reshow_after_days ?? null,
    };
  }

  @Put()
  async updateConfig(@Body() body: UpdateEntryPopupConfigDto) {
    return this.entryPopupService.upsertConfig(body);
  }
}
