import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentConfig } from '../entities/payment-config.entity';

@Injectable()
export class PaymentConfigService {
  constructor(
    @InjectRepository(PaymentConfig)
    private readonly repo: Repository<PaymentConfig>,
  ) {}

  async getConfig(): Promise<PaymentConfig | null> {
    const all = await this.repo.find({
      order: { id: 'ASC' },
      take: 1,
    });
    return all[0] ?? null;
  }

  async upsertConfig(
    payload: Partial<{
      bank_name: string | null;
      bank_account_type: string | null;
      bank_account_no: string | null;
      bank_account_name: string | null;
      payment_instructions: string | null;
      promptpay_qr_url: string | null;
      checkout_request_notify_email: string | null;
    }>,
  ): Promise<PaymentConfig> {
    const keys = [
      'bank_name',
      'bank_account_type',
      'bank_account_no',
      'bank_account_name',
      'payment_instructions',
      'promptpay_qr_url',
      'checkout_request_notify_email',
    ] as const;
    const existing = await this.getConfig();
    if (existing) {
      for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
          const v = payload[key];
          Object.assign(existing, { [key]: v ?? null });
        }
      }
      return this.repo.save(existing);
    }
    const created = this.repo.create({
      bank_name: 'bank_name' in payload ? payload.bank_name ?? null : null,
      bank_account_type:
        'bank_account_type' in payload ? payload.bank_account_type ?? null : null,
      bank_account_no:
        'bank_account_no' in payload ? payload.bank_account_no ?? null : null,
      bank_account_name:
        'bank_account_name' in payload ? payload.bank_account_name ?? null : null,
      payment_instructions:
        'payment_instructions' in payload
          ? payload.payment_instructions ?? null
          : null,
      promptpay_qr_url:
        'promptpay_qr_url' in payload ? payload.promptpay_qr_url ?? null : null,
      checkout_request_notify_email:
        'checkout_request_notify_email' in payload
          ? payload.checkout_request_notify_email ?? null
          : null,
    });
    return this.repo.save(created);
  }
}

