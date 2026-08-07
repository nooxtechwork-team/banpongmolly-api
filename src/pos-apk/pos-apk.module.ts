import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PosApkRelease } from '../entities/pos-apk-release.entity';
import { PosApkSettings } from '../entities/pos-apk-settings.entity';
import { PosApkService } from './pos-apk.service';
import { PosApkAdminController } from './pos-apk-admin.controller';
import { PosApkPublicController } from './pos-apk-public.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PosApkRelease, PosApkSettings]),
    AuthModule,
  ],
  providers: [PosApkService],
  controllers: [PosApkAdminController, PosApkPublicController],
  exports: [PosApkService],
})
export class PosApkModule {}
