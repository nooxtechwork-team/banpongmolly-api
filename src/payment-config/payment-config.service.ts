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
    }>,
  ): Promise<PaymentConfig> {
    const existing = await this.getConfig();
    if (existing) {
      Object.assign(existing, payload);
      return this.repo.save(existing);
    }
    const created = this.repo.create({
      bank_name: payload.bank_name ?? null,
      bank_account_type: payload.bank_account_type ?? null,
      bank_account_no: payload.bank_account_no ?? null,
      bank_account_name: payload.bank_account_name ?? null,
      payment_instructions: payload.payment_instructions ?? null,
      promptpay_qr_url: payload.promptpay_qr_url ?? null,
    });
    return this.repo.save(created);
  }
}

