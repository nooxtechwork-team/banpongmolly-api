import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { Audit } from '../common/decorators/audit.decorator';
import { PosApkService } from './pos-apk.service';
import { SetPosApkPasswordDto } from './dto/pos-apk.dto';
import type { User } from '../entities/user.entity';

const multerApk = {
  storage: memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
};

@Controller('admin/pos-apk')
@UseGuards(JwtAuthGuard, AdminGuard)
export class PosApkAdminController {
  constructor(private readonly posApkService: PosApkService) {}

  @Get()
  async list() {
    return this.posApkService.listReleases();
  }

  @Get('settings')
  async settings() {
    return this.posApkService.getSettingsPublic();
  }

  @Put('settings/password')
  @Audit({
    action: 'edit',
    entity_type: 'pos_apk_settings',
    entityIdSource: 'result:has_password',
  })
  async setPassword(@Body() dto: SetPosApkPasswordDto) {
    return this.posApkService.setPassword(dto.password);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', multerApk))
  @Audit({
    action: 'create',
    entity_type: 'pos_apk_release',
    entityIdSource: 'result:id',
  })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('version_name') versionName: string,
    @Body('notes') notes: string | undefined,
    @Request() req: { user: User },
  ) {
    if (!file) throw new BadRequestException('ไม่พบไฟล์ที่อัปโหลด');
    if (!versionName?.trim()) {
      throw new BadRequestException('กรุณาระบุชื่อเวอร์ชัน');
    }
    return this.posApkService.uploadRelease(
      file,
      versionName,
      notes,
      req.user?.id ?? null,
    );
  }

  @Patch(':id/activate')
  @Audit({
    action: 'edit',
    entity_type: 'pos_apk_release',
    entityIdSource: 'param:id',
  })
  async activate(@Param('id', ParseIntPipe) id: number) {
    return this.posApkService.activate(id);
  }

  @Delete(':id')
  @Audit({
    action: 'delete',
    entity_type: 'pos_apk_release',
    entityIdSource: 'param:id',
  })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.posApkService.remove(id);
    return { success: true, message: 'ลบเวอร์ชัน APK แล้ว' };
  }
}
