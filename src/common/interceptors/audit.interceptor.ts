import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import {
  AUDIT_META_KEY,
  type AuditMetadata,
} from '../decorators/audit.decorator';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { OrderType } from '../../entities/order.entity';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogService: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const meta = this.reflector.getAllAndOverride<AuditMetadata | undefined>(
      AUDIT_META_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!meta) {
      return next.handle();
    }

    const httpCtx = context.switchToHttp();
    const req = httpCtx.getRequest();

    return next.handle().pipe(
      tap(async (result) => {
        try {
          const entityId = this.resolveEntityId(
            meta.entityIdSource,
            req,
            result,
          );
          if (entityId == null) {
            return;
          }

          const user = req.user as
            | { id?: number; fullname?: string }
            | undefined;

          await this.auditLogService.create({
            action: meta.action,
            entity_type: meta.entity_type,
            entity_id: entityId,
            checker_user_id: user?.id ?? null,
            checker_name: user?.fullname ?? null,
            metadata: this.buildMetadata(meta, req, result),
          });
        } catch {
          // ไม่ให้ error จาก audit ทำให้ request หลักล้ม
        }
      }),
    );
  }

  private resolveEntityId(
    source: string | undefined,
    req: any,
    result: any,
  ): number | null {
    if (!source) return null;
    const [location, path] = source.split(':');
    if (!location || !path) return null;

    let value: any;
    if (location === 'param') {
      value = req.params?.[path];
    } else if (location === 'body') {
      value = req.body?.[path];
    } else if (location === 'result') {
      const payload =
        result && typeof result === 'object' && 'data' in result
          ? (result as any).data
          : result;
      value = this.getDeep(payload, path);
    }
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  }

  private getDeep(obj: any, path: string): any {
    return path
      .split('.')
      .reduce((acc, key) => (acc ? acc[key] : undefined), obj);
  }

  private buildMetadata(
    meta: AuditMetadata,
    req: any,
    result: any,
  ): Record<string, unknown> {
    const ipHeader =
      (req.headers['x-forwarded-for'] as string | undefined) || '';
    const clientIp =
      ipHeader.split(',')[0]?.trim() ||
      req.ip ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      null;
    const userAgent = (req.headers['user-agent'] as string | undefined) || null;

    const base: Record<string, unknown> = {
      method: req.method,
      path: req.originalUrl || req.url,
      ip: clientIp,
      user_agent: userAgent,
    };

    // ตัวอย่าง pattern สำหรับ order ที่มีในระบบนี้
    const body = req.body || {};
    if (body.order_no) {
      base.order_no = body.order_no;
    }
    if (
      meta.entity_type === 'payment' ||
      meta.entity_type === 'payment_sponsor'
    ) {
      const payload =
        result && typeof result === 'object' && 'data' in result
          ? (result as any).data
          : result;
      const order =
        (payload && (payload as any).order) ||
        (Array.isArray(payload) && payload[0] && (payload[0] as any).order);
      if (order?.order_no) {
        base.order_no = order.order_no;
      }
      if (order?.status) {
        base.status = order.status;
      }
      if (order?.type) {
        base.order_type = order.type as OrderType;
      }
      if (body.reason) {
        base.cancel_reason = body.reason;
      }
    }

    return base;
  }
}
