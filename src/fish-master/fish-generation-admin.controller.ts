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
import { FishGenerationService } from './fish-generation.service';
import {
  CreateFishLookupDto,
  UpdateFishLookupDto,
} from './dto/fish-lookup.dto';

@Controller('admin/fish-generations')
@UseGuards(JwtAuthGuard, AdminGuard)
export class FishGenerationAdminController {
  constructor(private readonly service: FishGenerationService) {}

  @Get()
  list() {
    return this.service.listAdmin();
  }

  @Post()
  @Audit({
    action: 'create',
    entity_type: 'fish_generation',
    entityIdSource: 'result:id',
  })
  create(@Body() dto: CreateFishLookupDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Audit({
    action: 'edit',
    entity_type: 'fish_generation',
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
    entity_type: 'fish_generation',
    entityIdSource: 'param:id',
  })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.service.remove(id);
  }
}
