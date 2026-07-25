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
 * ไม่ต้องส่ง device_code ก็ได้ — ระบบรู้เครื่องจาก API key
 */
@Controller('pos')
@UseGuards(PosApiKeyGuard)
export class PosDeviceController {
  constructor(private readonly checkoutQueueService: CheckoutQueueService) {}

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
      print: dto.print,
    });
  }

  /** เวอร์ชัน GET สำหรับ POS client ที่เรียกง่าย ๆ */
  @Get('next')
  next(
    @Request() req: PosRequest,
    @Query('device_code') deviceCode?: string,
    @Query('activity_id') activityId?: string,
    @Query('staff_name') staffName?: string,
    @Query('staff_user_id') staffUserId?: string,
    @Query('print') print?: string,
  ) {
    const code = this.resolveDeviceCode(req, deviceCode);
    return this.checkoutQueueService.claimNext({
      device_code: code,
      activity_id: activityId ? Number(activityId) : undefined,
      staff_name: staffName,
      staff_user_id: staffUserId ? Number(staffUserId) : undefined,
      print: print === '1' || print === 'true',
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
      print: dto.print,
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
      print: dto.print,
    });
  }

  /**
   * รวม device_code จาก body/query หรือจาก API key ของเครื่อง (req.posDevice)
   */
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
