import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadService, IMAGE_MIME_TYPES } from './upload.service';

const multerOptions = (maxSizeBytes: number) => ({
  storage: memoryStorage(),
  limits: { fileSize: maxSizeBytes },
});

@Controller('upload')
export class PublicUploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('payment-slip')
  @UseInterceptors(FileInterceptor('file', multerOptions(5 * 1024 * 1024)))
  async uploadPaymentSlip(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('ไม่พบไฟล์ที่อัปโหลด');
    if (!IMAGE_MIME_TYPES.includes(file.mimetype as any)) {
      throw new BadRequestException('รองรับเฉพาะรูปภาพ (JPEG, PNG, GIF, WebP)');
    }
    const url = await this.uploadService.saveFile(file, 'payment-slips');
    return { url };
  }
}
