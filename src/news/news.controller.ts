import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { NewsService } from './news.service';
import { NewsCategory } from '../entities/news.entity';

@Controller('news')
@UseInterceptors(ResponseInterceptor)
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  async listPublic(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
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

    return this.newsService.listPublic({
      page: pageNum,
      limit: limitNum,
      category: categoryEnum,
      search: search?.trim() || undefined,
    });
  }

  @Get(':slug')
  async getBySlug(@Param('slug') slug: string) {
    return this.newsService.findOneBySlug(slug);
  }
}
