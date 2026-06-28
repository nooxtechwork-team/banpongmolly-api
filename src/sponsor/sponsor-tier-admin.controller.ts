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
import { SponsorTierService } from './sponsor-tier.service';
import {
  CreateSponsorTierDto,
  UpdateSponsorTierDto,
} from './dto/sponsor-tier.dto';
import { Audit } from '../common/decorators/audit.decorator';

@Controller('admin/sponsor-tiers')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SponsorTierAdminController {
  constructor(private readonly tierService: SponsorTierService) {}

  @Get()
  list() {
    return this.tierService.listAdmin();
  }

  @Post()
  @Audit({
    action: 'create',
    entity_type: 'sponsor_tier',
    entityIdSource: 'result:id',
  })
  create(@Body() dto: CreateSponsorTierDto) {
    return this.tierService.create(dto);
  }

  @Patch(':id')
  @Audit({
    action: 'edit',
    entity_type: 'sponsor_tier',
    entityIdSource: 'param:id',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSponsorTierDto,
  ) {
    return this.tierService.update(id, dto);
  }

  @Delete(':id')
  @Audit({
    action: 'delete',
    entity_type: 'sponsor_tier',
    entityIdSource: 'param:id',
  })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.tierService.remove(id);
  }
}
