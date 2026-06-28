import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { Audit } from '../common/decorators/audit.decorator';
import { HeroBannerService } from './hero-banner.service';
import { CreateHeroBannerSlideDto } from './dto/create-hero-banner-slide.dto';
import { UpdateHeroBannerSlideDto } from './dto/update-hero-banner-slide.dto';
import { ReorderHeroBannerSlidesDto } from './dto/reorder-hero-banner-slides.dto';

@Controller('admin/hero-banners')
@UseGuards(JwtAuthGuard, AdminGuard)
@UseInterceptors(ResponseInterceptor)
export class HeroBannerAdminController {
  constructor(private readonly heroBannerService: HeroBannerService) {}

  @Get()
  async listAdmin() {
    return this.heroBannerService.listAdmin();
  }

  @Put('reorder')
  @Audit({
    action: 'edit',
    entity_type: 'banner',
    entityIdSource: 'body:ids',
  })
  async reorder(@Body() dto: ReorderHeroBannerSlidesDto) {
    return this.heroBannerService.reorder(dto.ids);
  }

  @Post()
  @Audit({
    action: 'create',
    entity_type: 'banner',
    entityIdSource: 'result:id',
  })
  async create(@Body() dto: CreateHeroBannerSlideDto) {
    return this.heroBannerService.create(dto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.heroBannerService.findOneById(Number(id));
  }

  @Patch(':id')
  @Audit({
    action: 'edit',
    entity_type: 'banner',
    entityIdSource: 'param:id',
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateHeroBannerSlideDto,
  ) {
    return this.heroBannerService.update(Number(id), dto);
  }

  @Delete(':id')
  @Audit({
    action: 'delete',
    entity_type: 'banner',
    entityIdSource: 'param:id',
  })
  async remove(@Param('id') id: string) {
    await this.heroBannerService.remove(Number(id));
    return { success: true, message: 'ลบสไลด์แบนเนอร์เรียบร้อยแล้ว' };
  }
}
