import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { Audit } from '../common/decorators/audit.decorator';
import { FishGenderService } from './fish-gender.service';
import {
  CreateFishLookupDto,
  UpdateFishLookupDto,
} from './dto/fish-lookup.dto';

@Controller('admin/fish-genders')
@UseGuards(JwtAuthGuard, AdminGuard)
export class FishGenderAdminController {
  constructor(private readonly service: FishGenderService) {}

  @Get()
  list() {
    return this.service.listAdmin();
  }

  @Post()
  @Audit({
    action: 'create',
    entity_type: 'fish_gender',
    entityIdSource: 'result:id',
  })
  create(@Body() dto: CreateFishLookupDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Audit({
    action: 'edit',
    entity_type: 'fish_gender',
    entityIdSource: 'param:id',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFishLookupDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Audit({
    action: 'delete',
    entity_type: 'fish_gender',
    entityIdSource: 'param:id',
  })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.service.remove(id);
  }
}
