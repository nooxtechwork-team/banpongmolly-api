import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CheckoutDevice } from '../entities/checkout-device.entity';

/**
 * ยืนยันตัวตนเครื่อง POS ด้วย API key ที่เก็บใน DB (checkout_devices.api_key)
 *
 * Header ที่รับ:
 *   - `X-POS-Api-Key: <api_key ของเครื่อง>`  (แนะนำ)
 *   - `X-POS-Device-Key: <api_key ของเครื่อง>` (รองรับแอปเดิม — ค่าต้องเป็น api_key ใน DB เหมือนกัน)
 *
 * เมื่อยืนยันผ่าน จะแนบ `req.posDevice` ให้ controller ใช้ได้
 */
@Injectable()
export class PosApiKeyGuard implements CanActivate {
  constructor(
    @InjectRepository(CheckoutDevice)
    private readonly deviceRepo: Repository<CheckoutDevice>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      posDevice?: CheckoutDevice;
    }>();

    const key =
      this.header(req, 'x-pos-api-key') ||
      this.header(req, 'x-pos-device-key');

    if (!key) {
      throw new UnauthorizedException(
        'Missing POS API key (header X-POS-Api-Key)',
      );
    }

    const device = await this.deviceRepo.findOne({
      where: { api_key: key, is_active: true },
    });
    if (!device) {
      throw new UnauthorizedException('Invalid POS API key');
    }

    req.posDevice = device;
    return true;
  }

  private header(
    req: { headers: Record<string, string | string[] | undefined> },
    name: string,
  ): string {
    const raw = req.headers[name];
    return (Array.isArray(raw) ? raw[0] : raw || '').trim();
  }
}
