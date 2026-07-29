import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { CheckoutDevice } from '../entities/checkout-device.entity';
import { PosApiKeyGuard } from '../pos-auth/pos-api-key.guard';
import { PrintJobService } from '../print-job/print-job.service';
import { PosPrintReportDto } from '../print-job/dto/print-job.dto';
import { CheckoutQueueService } from './checkout-queue.service';
import {
  PosClaimNextDto,
  PosTransitionDto,
  DeviceHeartbeatDto,
} from './dto/checkout-queue.dto';

type PosRequest = { posDevice?: CheckoutDevice };

/**
 * Controller ของเครื่อง POS (Sunmi) เอง — คิวคืนปลาแบบ Pull Queue + Auto Lock
 *
 * Auth: header `X-POS-Api-Key` ตรงกับ `checkout_devices.api_key` ใน DB
 * พิมพ์ใบงานบนเครื่อง → รายงานผลด้วย POST /pos/print-report
 */
@Controller('pos')
@UseGuards(PosApiKeyGuard)
export class PosDeviceController {
  constructor(
    private readonly checkoutQueueService: CheckoutQueueService,
    private readonly printJobService: PrintJobService,
  ) {}

  /** heartbeat: บอกว่าเครื่องออนไลน์ + ดึงคิวปัจจุบันของเครื่อง */
  @Post('heartbeat')
  heartbeat(@Request() req: PosRequest, @Body() dto: DeviceHeartbeatDto) {
    const deviceCode = this.resolveDeviceCode(req, dto.device_code);
    return this.checkoutQueueService.heartbeat(deviceCode, dto.activity_id);
  }

  /** คิวที่เครื่องนี้กำลังทำอยู่ */
  @Get('current')
  current(@Request() req: PosRequest, @Query('device_code') code?: string) {
    const deviceCode = this.resolveDeviceCode(req, code);
    return this.checkoutQueueService.getCurrentForDevice(deviceCode);
  }

  /** กด "รับคิว" — ดึงคิว waiting ถัดไปแล้วล็อกให้เครื่องนี้ (waiting → preparing) */
  @Post('claim-next')
  claimNext(@Request() req: PosRequest, @Body() dto: PosClaimNextDto) {
    const deviceCode = this.resolveDeviceCode(req, dto.device_code);
    return this.checkoutQueueService.claimNext({
      device_code: deviceCode,
      activity_id: dto.activity_id,
      staff_name: dto.staff_name,
      staff_user_id: dto.staff_user_id,
    });
  }

  /**
   * รับคิวแล้วข้าม preparing — waiting → ready ในครั้งเดียว (ผูก device ตอนเครื่องกดรับ)
   */
  @Post('claim-next-ready')
  claimNextReady(@Request() req: PosRequest, @Body() dto: PosClaimNextDto) {
    const deviceCode = this.resolveDeviceCode(req, dto.device_code);
    return this.checkoutQueueService.claimNextReady({
      device_code: deviceCode,
      activity_id: dto.activity_id,
      staff_name: dto.staff_name,
      staff_user_id: dto.staff_user_id,
    });
  }

  /** กด "พร้อมรับปลา" (preparing → ready) */
  @Post('queue/:queueCode/ready')
  ready(
    @Request() req: PosRequest,
    @Param('queueCode') queueCode: string,
    @Body() dto: PosTransitionDto,
  ) {
    return this.checkoutQueueService.markReady(queueCode, {
      device_code: dto.device_code ?? req.posDevice?.device_code,
      staff_name: dto.staff_name,
      staff_user_id: dto.staff_user_id,
    });
  }

  /** กด "คืนปลา" ยืนยันเสร็จสิ้น (ready/preparing → complete) */
  @Post('queue/:queueCode/complete')
  complete(
    @Request() req: PosRequest,
    @Param('queueCode') queueCode: string,
    @Body() dto: PosTransitionDto,
  ) {
    return this.checkoutQueueService.complete(queueCode, {
      device_code: dto.device_code ?? req.posDevice?.device_code,
      staff_name: dto.staff_name,
      staff_user_id: dto.staff_user_id,
    });
  }

  /** ปฏิเสธคิว (preparing|ready → cancelled) — ลูกค้าต้องสร้างคิวใหม่ */
  @Post('queue/:queueCode/release')
  release(
    @Request() req: PosRequest,
    @Param('queueCode') queueCode: string,
    @Body() dto: PosTransitionDto,
  ) {
    return this.checkoutQueueService.releaseTicketFromPos(queueCode, {
      device_code: dto.device_code ?? req.posDevice?.device_code,
      staff_name: dto.staff_name,
      staff_user_id: dto.staff_user_id,
    });
  }

  /**
   * บันทึกผลพิมพ์ local ลง print_jobs
   * เรียกหลังพิมพ์ใบคืนปลาบนเครื่อง (สำเร็จหรือล้มเหลว)
   */
  @Post('print-report')
  async printReport(
    @Request() req: PosRequest,
    @Body() dto: PosPrintReportDto,
  ) {
    const deviceCode = this.resolveDeviceCode(req, dto.device_code);
    const ticket = await this.checkoutQueueService.getTicketDetail(
      dto.ticket_id,
    );
    return this.printJobService.recordPosLocalPrint({
      deviceCode,
      queueCode: ticket.queue_code,
      queueNo: ticket.queue_no,
      applicantName: ticket.applicant_name,
      staffName: ticket.staff_name,
      note: ticket.note,
      items: ticket.items.map((i) => ({
        entry_code: i.entry_code,
        package_name: i.package_name,
        registration_no: i.registration_no,
      })),
      status: dto.status,
      error: dto.error,
    });
  }

  private resolveDeviceCode(req: PosRequest, provided?: string): string {
    const code = (provided || req.posDevice?.device_code || '').trim();
    if (!code) {
      throw new BadRequestException(
        'ต้องระบุ device_code หรือใช้ API key เฉพาะเครื่อง',
      );
    }
    return code;
  }
}
