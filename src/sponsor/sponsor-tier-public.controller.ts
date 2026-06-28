import { Controller, Get } from '@nestjs/common';
import { SponsorTierService } from './sponsor-tier.service';

@Controller('sponsor-tiers')
export class SponsorTierPublicController {
  constructor(private readonly tierService: SponsorTierService) {}

  @Get()
  list() {
    return this.tierService.listPublic();
  }
}
