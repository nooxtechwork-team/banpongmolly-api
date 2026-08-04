import { Controller, Get } from '@nestjs/common';
import { FishGenerationService } from './fish-generation.service';

@Controller('fish-generations')
export class FishGenerationPublicController {
  constructor(private readonly service: FishGenerationService) {}

  @Get()
  list() {
    return this.service.listPublic();
  }
}
