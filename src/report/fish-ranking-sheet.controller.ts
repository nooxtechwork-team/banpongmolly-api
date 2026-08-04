import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ReportService } from './report.service';

@Controller('admin/reports/fish-ranking-sheet')
@UseGuards(JwtAuthGuard, AdminGuard)
export class FishRankingSheetController {
  constructor(private readonly reportService: ReportService) {}

  /** รายการกิจกรรมที่มีผู้สมัครชำระเงินแล้ว (ชุดเดียวกับรายงานผู้เข้าร่วม) */
  @Get('activities')
  async listActivities(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ): Promise<{
    items: Awaited<
      ReturnType<ReportService['listActivityAttendanceActivities']>
    >['items'];
    total: number;
  }> {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
    const limitNum = limit
      ? Math.min(100, Math.max(1, parseInt(limit, 10) || 10))
      : 10;
    return this.reportService.listActivityAttendanceActivities(
      pageNum,
      limitNum,
      { search: search?.trim() || undefined },
    );
  }

  /** ข้อมูลใบจัดอันดับ — เรียงตามคลาส / ผู้สมัคร / Order / รหัสปลา */
  @Get('activities/:activityId')
  async activityDetail(
    @Param('activityId', ParseIntPipe) activityId: number,
    @Query('package_id') packageId?: string,
  ): Promise<Awaited<ReturnType<ReportService['getFishRankingSheet']>>> {
    const pid = packageId ? parseInt(packageId, 10) : NaN;
    return this.reportService.getFishRankingSheet(
      activityId,
      Number.isFinite(pid) && pid > 0 ? pid : undefined,
    );
  }

  /** Export PDF สำหรับ staff กรอกอันดับ + เซ็นลูกค้าบนกระดาษ */
  @Get('activities/:activityId/ranking-sheet.pdf')
  async rankingSheetPdf(
    @Param('activityId', ParseIntPipe) activityId: number,
    @Query('package_id') packageId: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const pid = packageId ? parseInt(packageId, 10) : NaN;
      const { pdf, filename } =
        await this.reportService.generateFishRankingSheetPdf(
          activityId,
          Number.isFinite(pid) && pid > 0 ? pid : undefined,
        );
      const buf = Buffer.from(pdf);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', String(buf.length));
      res.setHeader('Cache-Control', 'no-store');
      const asciiFallback = 'fish-ranking-sheet.pdf';
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
      res.end(buf);
    } catch (err) {
      if (res.headersSent) {
        res.destroy(err instanceof Error ? err : undefined);
        return;
      }
      const message =
        err instanceof Error && err.message.trim()
          ? err.message.trim()
          : 'สร้าง PDF ไม่สำเร็จ';
      const status =
        err &&
        typeof err === 'object' &&
        'getStatus' in err &&
        typeof (err as { getStatus: () => number }).getStatus === 'function'
          ? (err as { getStatus: () => number }).getStatus()
          : 500;
      res.status(status).json({
        success: false,
        message,
      });
    }
  }
}
