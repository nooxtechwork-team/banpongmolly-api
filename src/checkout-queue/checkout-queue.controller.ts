import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PosApiKeyGuard } from '../pos-auth/pos-api-key.guard';
import { CheckoutQueueService } from './checkout-queue.service';
import {
  ClaimNextCheckoutQueueDto,
  CheckoutQueueTransitionDto,
  DeviceHeartbeatDto,
} from './dto/checkout-queue.dto';

@Controller('checkout-queue')
export class CheckoutQueueController {
  constructor(private readonly checkoutQueueService: CheckoutQueueService) {}

  /** Pull next waiting ticket and lock to this device */
  @Post('claim-next')
  @UseGuards(PosApiKeyGuard)
  claimNext(@Body() dto: ClaimNextCheckoutQueueDto) {
    return this.checkoutQueueService.claimNext(dto);
  }

  /** Same as claim-next via GET for simple POS clients */
  @Get('next')
  @UseGuards(PosApiKeyGuard)
  next(
    @Query('device_code') deviceCode: string,
    @Query('activity_id') activityId?: string,
    @Query('staff_name') staffName?: string,
    @Query('staff_user_id') staffUserId?: string,
    @Query('print') print?: string,
  ) {
    return this.checkoutQueueService.claimNext({
      device_code: deviceCode,
      activity_id: activityId ? Number(activityId) : undefined,
      staff_name: staffName,
      staff_user_id: staffUserId ? Number(staffUserId) : undefined,
      print: print === '1' || print === 'true',
    });
  }

  @Get('devices/:deviceCode/current')
  @UseGuards(PosApiKeyGuard)
  current(@Param('deviceCode') deviceCode: string) {
    return this.checkoutQueueService.getCurrentForDevice(deviceCode);
  }

  @Post('devices/:deviceCode/heartbeat')
  @UseGuards(PosApiKeyGuard)
  heartbeat(
    @Param('deviceCode') deviceCode: string,
    @Body() dto: DeviceHeartbeatDto,
  ) {
    return this.checkoutQueueService.heartbeat(deviceCode, dto.activity_id);
  }

  @Post(':queueCode/ready')
  @UseGuards(PosApiKeyGuard)
  ready(
    @Param('queueCode') queueCode: string,
    @Body() dto: CheckoutQueueTransitionDto,
  ) {
    return this.checkoutQueueService.markReady(queueCode, dto);
  }

  @Post(':queueCode/complete')
  @UseGuards(PosApiKeyGuard)
  complete(
    @Param('queueCode') queueCode: string,
    @Body() dto: CheckoutQueueTransitionDto,
  ) {
    return this.checkoutQueueService.complete(queueCode, dto);
  }
}
