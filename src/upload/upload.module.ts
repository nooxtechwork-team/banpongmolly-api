import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { PublicUploadController } from './public-upload.controller';

@Module({
  controllers: [UploadController, PublicUploadController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
