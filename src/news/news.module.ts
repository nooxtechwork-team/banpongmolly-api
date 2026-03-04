import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { News } from '../entities/news.entity';
import { NewsService } from './news.service';
import { NewsController } from './news.controller';
import { NewsAdminController } from './news-admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([News])],
  controllers: [NewsController, NewsAdminController],
  providers: [NewsService],
})
export class NewsModule {}
