import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AccessLogService } from '../../access-log/access-log.service';

@Injectable()
export class AccessLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AccessLog');

  constructor(private readonly accessLogService: AccessLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const startedAt = Date.now();
    const http = context.switchToHttp();
    const req = http.getRequest();

    const { method, originalUrl, url } = req;
    const path: string = originalUrl || url;
    const user = req.user as { id?: number; email?: string } | undefined;
    const userLabel = user?.id ? `user#${user.id}` : 'guest';

    const ipHeader =
      (req.headers['x-forwarded-for'] as string | undefined) || '';
    const clientIp =
      ipHeader.split(',')[0]?.trim() ||
      req.ip ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      null;

    // Clone headers and strip sensitive ones
    const headers = { ...(req.headers as Record<string, unknown>) };
    delete (headers as Record<string, unknown>)['authorization'];
    delete (headers as Record<string, unknown>)['cookie'];

    const requestQuery =
      (req.query && { ...(req.query as Record<string, unknown>) }) || null;
    const requestBody =
      (req.body && { ...(req.body as Record<string, unknown>) }) || null;

    return next.handle().pipe(
      tap(async () => {
        const res = http.getResponse();
        const statusCode = res.statusCode as number;
        const duration = Date.now() - startedAt;

        // Keep console log for quick debugging
        this.logger.log(
          `${method} ${path} ${statusCode} - ${duration}ms - ${userLabel}`,
        );

        try {
          const responseHeaders = res.getHeaders
            ? (res.getHeaders() as Record<string, unknown>)
            : null;

          await this.accessLogService.create({
            method,
            path,
            status_code: statusCode,
            duration_ms: duration,
            ip: clientIp,
            user_agent:
              (req.headers['user-agent'] as string | undefined) || null,
            user_id: user?.id ?? null,
            user_email: user?.email ?? null,
            request_headers: headers,
            request_query: requestQuery,
            request_body: requestBody,
            response_headers: responseHeaders,
          });
        } catch (err) {
          // ไม่ให้ error จาก access log ทำให้ request หลักล้ม
          this.logger.error('Failed to write access log', err as Error);
        }
      }),
    );
  }
}
