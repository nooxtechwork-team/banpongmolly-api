import { Controller, Get } from '@nestjs/common';
import { HeroBannerService } from './hero-banner.service';

@Controller('hero-banners')
export class HeroBannerPublicController {
  constructor(private readonly heroBannerService: HeroBannerService) {}

  @Get()
  async listPublic() {
    return this.heroBannerService.listPublic();
  }
}
