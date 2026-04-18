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

@Controller('admin/reports/activity-package-counts')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ActivityPackageCountsController {
  constructor(private readonly reportService: ReportService) {}

  /** สรุปจำนวนรายการสมัคร (ผลรวม quantity) ต่อ Package/คลาส — เฉพาะชำระเงินแล้ว */
  @Get('activities/:activityId')
  async packageCountsByActivity(
    @Param('activityId', ParseIntPipe) activityId: number,
  ): Promise<
    Awaited<ReturnType<ReportService['getActivityPaidPackageItemCounts']>>
  > {
    return this.reportService.getActivityPaidPackageItemCounts(activityId);
  }

  /** ส่งออก Excel (.xlsx) — query `q` กรอง slug / ชื่อ path / package_id เหมือนหน้าเว็บ */
  @Get('activities/:activityId/export.xlsx')
  async exportPackageCountsXlsx(
    @Param('activityId', ParseIntPipe) activityId: number,
    @Query('q') q: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } =
      await this.reportService.generateActivityPaidPackageCountsExcel(
        activityId,
        q?.trim() || undefined,
      );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    const asciiFallback = 'activity-package-counts.xlsx';
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(buffer);
  }
}
