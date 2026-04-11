import { Body, Controller, Get, Put } from '@nestjs/common';
import { PaymentConfigService } from './payment-config.service';

@Controller('admin/payment-config')
export class PaymentConfigController {
  constructor(private readonly service: PaymentConfigService) {}

  @Get()
  async getConfig() {
    return this.service.getConfig();
  }

  @Put()
  async updateConfig(
    @Body()
    body: Partial<{
      bank_name: string | null;
      bank_account_type: string | null;
      bank_account_no: string | null;
      bank_account_name: string | null;
      payment_instructions: string | null;
      promptpay_qr_url: string | null;
      checkout_request_notify_email: string | null;
    }>,
  ) {
    return this.service.upsertConfig(body);
  }
}

