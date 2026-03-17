import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { NewsService } from './news.service';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { NewsCategory } from '../entities/news.entity';
import { Audit } from '../common/decorators/audit.decorator';

@Controller('admin/news')
@UseGuards(JwtAuthGuard, AdminGuard)
@UseInterceptors(ResponseInterceptor)
export class NewsAdminController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  async listAdmin(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
    const limitNum = limit
      ? Math.min(100, Math.max(1, parseInt(limit, 10) || 20))
      : 20;

    const categoryEnum =
      category === 'news' || category === 'announcement' || category === 'event'
        ? (category as NewsCategory)
        : category === 'all'
          ? 'all'
          : undefined;

    const statusFilter =
      status === 'published' || status === 'draft' ? status : 'all';

    return this.newsService.listAdmin({
      page: pageNum,
      limit: limitNum,
      category: categoryEnum,
      status: statusFilter,
      search: search?.trim() || undefined,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.newsService.findOneById(Number(id));
  }

  @Post()
  @Audit({
    action: 'create',
    entity_type: 'news',
    entityIdSource: 'result:id',
  })
  async create(@Body() dto: CreateNewsDto) {
    return this.newsService.create(dto);
  }

  @Patch(':id')
  @Audit({
    action: 'edit',
    entity_type: 'news',
    entityIdSource: 'param:id',
  })
  async update(@Param('id') id: string, @Body() dto: UpdateNewsDto) {
    return this.newsService.update(Number(id), dto);
  }

  @Delete(':id')
  @Audit({
    action: 'delete',
    entity_type: 'news',
    entityIdSource: 'param:id',
  })
  async remove(@Param('id') id: string) {
    await this.newsService.remove(Number(id));
    return { success: true, message: 'ลบบทความข่าวเรียบร้อยแล้ว' };
  }
}
