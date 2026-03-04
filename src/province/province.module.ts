import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Province } from '../entities/province.entity';
import { Activity } from '../entities/activity.entity';
import { ProvinceService } from './province.service';
import { ProvinceController } from './province.controller';
import { ProvinceAdminController } from './province-admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Province, Activity])],
  controllers: [ProvinceController, ProvinceAdminController],
  providers: [ProvinceService],
  exports: [ProvinceService],
})
export class ProvinceModule {}
