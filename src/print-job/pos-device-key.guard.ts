import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * POS devices authenticate with header X-POS-Device-Key
 * (shared secret from POS_PRINT_DEVICE_KEY).
 */
@Injectable()
export class PosDeviceKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = (
      this.config.get<string>('POS_PRINT_DEVICE_KEY') || ''
    ).trim();
    if (!expected) {
      throw new UnauthorizedException(
        'POS_PRINT_DEVICE_KEY is not configured on the server',
      );
    }
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const raw = req.headers['x-pos-device-key'];
    const got = (Array.isArray(raw) ? raw[0] : raw || '').trim();
    if (!got || got !== expected) {
      throw new UnauthorizedException('Invalid POS device key');
    }
    return true;
  }
}
