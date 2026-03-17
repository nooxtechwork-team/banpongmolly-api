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
import { ProvinceService } from './province.service';
import { Province } from '../entities/province.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CreateProvinceDto } from './dto/create-province.dto';
import { UpdateProvinceDto } from './dto/update-province.dto';
import { Audit } from '../common/decorators/audit.decorator';

@Controller('admin/provinces')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ProvinceAdminController {
  constructor(private readonly provinceService: ProvinceService) {}

  @Get()
  async list(): Promise<Province[]> {
    return this.provinceService.findAllAdmin();
  }

  @Post()
  @Audit({
    action: 'create',
    entity_type: 'province',
    entityIdSource: 'result:id',
  })
  async create(@Body() dto: CreateProvinceDto): Promise<Province> {
    return this.provinceService.createProvince(dto);
  }

  @Patch(':id')
  @Audit({
    action: 'edit',
    entity_type: 'province',
    entityIdSource: 'param:id',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProvinceDto,
  ): Promise<Province> {
    return this.provinceService.updateProvince(id, dto);
  }

  @Delete(':id')
  @Audit({
    action: 'delete',
    entity_type: 'province',
    entityIdSource: 'param:id',
  })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.provinceService.deleteProvince(id);
  }

  @Post(':id/feature-homepage')
  @Audit({
    action: 'edit',
    entity_type: 'province',
    entityIdSource: 'param:id',
  })
  async setFeaturedHomepage(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { featured: boolean },
  ): Promise<Province> {
    return this.provinceService.setHomepageFeatured(id, !!body.featured);
  }
}
