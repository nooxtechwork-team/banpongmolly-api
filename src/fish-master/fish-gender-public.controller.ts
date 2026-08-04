import { Controller, Get } from '@nestjs/common';
import { FishGenderService } from './fish-gender.service';

@Controller('fish-genders')
export class FishGenderPublicController {
  constructor(private readonly service: FishGenderService) {}

  @Get()
  list() {
    return this.service.listPublic();
  }
}
