import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HeroBannerSlide } from '../entities/hero-banner-slide.entity';
import { HeroBannerService } from './hero-banner.service';
import { HeroBannerPublicController } from './hero-banner-public.controller';
import { HeroBannerAdminController } from './hero-banner-admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([HeroBannerSlide])],
  providers: [HeroBannerService],
  controllers: [HeroBannerPublicController, HeroBannerAdminController],
  exports: [HeroBannerService],
})
export class HeroBannerModule {}
