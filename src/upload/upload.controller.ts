import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { UploadService, IMAGE_MIME_TYPES } from './upload.service';

const multerOptions = (maxSizeBytes: number) => ({
  storage: memoryStorage(),
  limits: { fileSize: maxSizeBytes },
});

@Controller('admin/upload')
@UseGuards(JwtAuthGuard, AdminGuard)
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('event-image')
  @UseInterceptors(FileInterceptor('file', multerOptions(5 * 1024 * 1024)))
  async uploadEventImage(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('ไม่พบไฟล์ที่อัปโหลด');
    if (!IMAGE_MIME_TYPES.includes(file.mimetype as any)) {
      throw new BadRequestException('รองรับเฉพาะรูปภาพ (JPEG, PNG, GIF, WebP)');
    }
    const url = await this.uploadService.saveFile(file, 'events');
    return { url };
  }

  @Post('news-image')
  @UseInterceptors(FileInterceptor('file', multerOptions(5 * 1024 * 1024)))
  async uploadNewsImage(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('ไม่พบไฟล์ที่อัปโหลด');
    if (!IMAGE_MIME_TYPES.includes(file.mimetype as any)) {
      throw new BadRequestException('รองรับเฉพาะรูปภาพ (JPEG, PNG, GIF, WebP)');
    }
    const url = await this.uploadService.saveFile(file, 'news');
    return { url };
  }

  @Post('organizer-image')
  @UseInterceptors(FileInterceptor('file', multerOptions(2 * 1024 * 1024)))
  async uploadOrganizerImage(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('ไม่พบไฟล์ที่อัปโหลด');
    if (!IMAGE_MIME_TYPES.includes(file.mimetype as any)) {
      throw new BadRequestException('รองรับเฉพาะรูปภาพ (JPEG, PNG, GIF, WebP)');
    }
    const url = await this.uploadService.saveFile(file, 'organizers');
    return { url };
  }

  @Post('activity-image')
  @UseInterceptors(FileInterceptor('file', multerOptions(5 * 1024 * 1024)))
  async uploadActivityImage(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('ไม่พบไฟล์ที่อัปโหลด');
    if (!IMAGE_MIME_TYPES.includes(file.mimetype as any)) {
      throw new BadRequestException('รองรับเฉพาะรูปภาพ (JPEG, PNG, GIF, WebP)');
    }
    const url = await this.uploadService.saveFile(file, 'activities');
    return { url };
  }

  /** รูป PromptPay / QR ในหน้าตั้งค่าบัญชีผู้รับเงิน (แยก path จากสลิปผู้สมัคร) */
  @Post('payment-config-qr')
  @UseInterceptors(FileInterceptor('file', multerOptions(5 * 1024 * 1024)))
  async uploadPaymentConfigQr(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('ไม่พบไฟล์ที่อัปโหลด');
    if (!IMAGE_MIME_TYPES.includes(file.mimetype as any)) {
      throw new BadRequestException('รองรับเฉพาะรูปภาพ (JPEG, PNG, GIF, WebP)');
    }
    const url = await this.uploadService.saveFile(file, 'payment-configs');
    return { url };
  }
}
