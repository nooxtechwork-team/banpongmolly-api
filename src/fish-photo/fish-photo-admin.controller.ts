import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { User } from '../entities/user.entity';
import { FishPhotoService } from './fish-photo.service';

const multerOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB ต่อภาพ (ถ่ายจาก iPad)
};

@Controller('admin/fish-photos')
@UseGuards(JwtAuthGuard, AdminGuard)
export class FishPhotoAdminController {
  constructor(private readonly fishPhotoService: FishPhotoService) {}

  /** รายการกิจกรรมที่มีปลาที่ยืนยันภาพแล้ว */
  @Get('dashboard/activities')
  listDashboardActivities(@Query('search') search?: string) {
    return this.fishPhotoService.listDashboardActivities(search);
  }

  /** Dashboard ปลาที่ยืนยันแล้วในกิจกรรม */
  @Get('dashboard/activities/:activityId')
  getActivityDashboard(
    @Param('activityId', ParseIntPipe) activityId: number,
    @Query('search') search?: string,
  ) {
    return this.fishPhotoService.getActivityDashboard(activityId, search);
  }

  /** ค้นหา Order → รายการปลา + สถานะถ่ายภาพ (โยงกับกิจกรรมผ่าน registration) */
  @Get('orders/:code/entries')
  getOrderEntries(@Param('code') code: string) {
    return this.fishPhotoService.getOrderFishList(code);
  }

  /** Gallery ทั้ง order — เฉพาะปลาที่ยืนยันแล้ว */
  @Get('orders/:code/gallery')
  getOrderGallery(@Param('code') code: string) {
    return this.fishPhotoService.getOrderGallery(code);
  }

  /** ยืนยันทั้ง order (ตัวที่มีภาพแล้ว) */
  @Post('orders/:code/confirm')
  confirmOrder(
    @Param('code') code: string,
    @Req() req: { user: User },
  ) {
    return this.fishPhotoService.confirmOrder(code, req.user);
  }

  /** ดึงข้อมูลปลา + ภาพ จากรหัส entry_code */
  @Get('entries/by-code/:entryCode')
  getByEntryCode(@Param('entryCode') entryCode: string) {
    return this.fishPhotoService.getFishDetail(entryCode);
  }

  /** ดึงข้อมูลปลา + ภาพ จาก entry id */
  @Get('entries/:entryId')
  getByEntryId(@Param('entryId', ParseIntPipe) entryId: number) {
    return this.fishPhotoService.getFishDetailById(entryId);
  }

  /** Gallery ปลาตัวเดียว (ต้อง confirmed แล้ว) */
  @Get('entries/:entryId/gallery')
  getFishGallery(@Param('entryId', ParseIntPipe) entryId: number) {
    return this.fishPhotoService.getFishGallery(entryId);
  }

  /** อัปโหลดภาพ (สูงสุด 10 ต่อตัว, reject ถ้า confirmed) */
  @Post('entries/:entryId/photos')
  @UseInterceptors(FileInterceptor('file', multerOptions))
  uploadPhoto(
    @Param('entryId', ParseIntPipe) entryId: number,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: { user: User },
  ) {
    if (!file) throw new BadRequestException('ไม่พบไฟล์ที่อัปโหลด');
    return this.fishPhotoService.uploadPhoto(entryId, file, req.user);
  }

  /** ลบภาพเพื่อถ่ายใหม่ (reject ถ้า confirmed) */
  @Delete('entries/:entryId/photos/:photoId')
  deletePhoto(
    @Param('entryId', ParseIntPipe) entryId: number,
    @Param('photoId', ParseIntPipe) photoId: number,
  ) {
    return this.fishPhotoService.deletePhoto(entryId, photoId);
  }

  /** ยืนยันปลาตัวนี้ → lock ถาวร */
  @Post('entries/:entryId/confirm')
  confirmFish(
    @Param('entryId', ParseIntPipe) entryId: number,
    @Req() req: { user: User },
  ) {
    return this.fishPhotoService.confirmFish(entryId, req.user);
  }
}
