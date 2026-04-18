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

@Controller('admin/reports/activity-attendance')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  /** รายการกิจกรรมที่มีผู้สมัครชำระเงินแล้ว (ไม่กรองเช็คอิน) */
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
      ? Math.min(100, Math.max(1, parseInt(limit, 10) || 20))
      : 20;
    return this.reportService.listActivityAttendanceActivities(
      pageNum,
      limitNum,
      { search: search?.trim() || undefined },
    );
  }

  /**
   * Export PDF — ทั้งกิจกรรม หรือรายบุคคลด้วย query `group_key` (ค่าเดียวกับใน JSON รายละเอียด)
   */
  @Get('activities/:activityId/attendance.pdf')
  async activityAttendancePdf(
    @Param('activityId', ParseIntPipe) activityId: number,
    @Query('group_key') groupKey: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { pdf, filename } =
      await this.reportService.generateActivityAttendancePdf(
        activityId,
        groupKey?.trim() || undefined,
      );
    res.setHeader('Content-Type', 'application/pdf');
    const asciiFallback = 'activity-attendance.pdf';
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(Buffer.from(pdf));
  }

  /**
   * Export PDF — เฉพาะราย Order เรียงเวลาสมัครจากเก่าไปใหม่ ไม่มีบล็อกจัดกลุ่มตาม User
   */
  @Get('activities/:activityId/attendance-by-order.pdf')
  async activityAttendanceByOrderPdf(
    @Param('activityId', ParseIntPipe) activityId: number,
    @Res() res: Response,
  ): Promise<void> {
    const { pdf, filename } =
      await this.reportService.generateActivityAttendancePdfByOrder(activityId);
    res.setHeader('Content-Type', 'application/pdf');
    const asciiFallback = 'activity-attendance-orders.pdf';
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(Buffer.from(pdf));
  }

  /** รายละเอียดต่อกิจกรรม — ผู้สมัครชำระเงินแล้วทั้งหมด; จัดกลุ่มตามผู้ใช้ (user_id หรือเบอร์+ชื่อ) */
  @Get('activities/:activityId')
  async activityDetail(
    @Param('activityId', ParseIntPipe) activityId: number,
  ): Promise<
    Awaited<ReturnType<ReportService['getActivityAttendanceDetail']>>
  > {
    return this.reportService.getActivityAttendanceDetail(activityId);
  }
}
