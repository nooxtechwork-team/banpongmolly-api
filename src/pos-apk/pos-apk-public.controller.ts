import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PosApkService } from './pos-apk.service';
import { UnlockPosApkDto } from './dto/pos-apk.dto';

@Controller('pos-apk')
export class PosApkPublicController {
  constructor(private readonly posApkService: PosApkService) {}

  @Get('public')
  async publicMeta() {
    return this.posApkService.getPublicMeta();
  }

  @Post('unlock')
  async unlock(@Body() dto: UnlockPosApkDto, @Req() req: Request) {
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)
        ?.split(',')[0]
        ?.trim() ||
      req.ip ||
      'unknown';
    return this.posApkService.unlock(dto.password, ip);
  }

  @Get('download')
  async download(
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!token?.trim()) {
      throw new ForbiddenException('ไม่พบโทเคนดาวน์โหลด');
    }
    const { stream, filename, size } =
      await this.posApkService.openDownloadStream(token.trim());

    const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_') || 'app.apk';
    res.setHeader(
      'Content-Type',
      'application/vnd.android.package-archive',
    );
    res.setHeader('Content-Length', String(size));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.setHeader('Cache-Control', 'no-store');

    await new Promise<void>((resolve, reject) => {
      stream.on('error', (err) => {
        if (!res.headersSent) {
          res.status(500).end();
        } else {
          res.destroy();
        }
        reject(err);
      });
      res.on('finish', () => resolve());
      res.on('close', () => resolve());
      stream.pipe(res);
    });
  }
}
