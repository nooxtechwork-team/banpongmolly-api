import { Controller, Get } from '@nestjs/common';
import { ProvinceService } from './province.service';
import { Province } from '../entities/province.entity';

@Controller('provinces')
export class ProvinceController {
  constructor(private readonly provinceService: ProvinceService) {}

  @Get()
  async list(): Promise<Province[]> {
    return this.provinceService.findAll();
  }

  @Get('featured/homepage')
  async listFeaturedForHomepage() {
    return this.provinceService.listFeaturedForHomepage();
  }
}
