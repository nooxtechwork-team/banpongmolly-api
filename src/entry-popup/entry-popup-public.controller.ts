import { Controller, Get } from '@nestjs/common';
import { EntryPopupService } from './entry-popup.service';

@Controller('entry-popup')
export class EntryPopupPublicController {
  constructor(private readonly entryPopupService: EntryPopupService) {}

  @Get()
  async getPublic() {
    return this.entryPopupService.getPublicView();
  }
}
