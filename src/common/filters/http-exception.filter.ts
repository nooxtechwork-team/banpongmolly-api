import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';
import { ResponseUtil } from '../utils/response.util';

const DEFAULT_MESSAGE_TH: Record<number, string> = {
  400: 'คำขอไม่ถูกต้อง',
  401: 'กรุณาเข้าสู่ระบบ',
  403: 'ไม่มีสิทธิ์เข้าถึง',
  404: 'ไม่พบข้อมูล',
  500: 'เกิดข้อผิดพลาดภายในระบบ',
};

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    let message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as any).message || exception.message;

    if (Array.isArray(message)) {
      message = message[0] || DEFAULT_MESSAGE_TH[status] || 'เกิดข้อผิดพลาด';
    } else if (!message || typeof message !== 'string') {
      message = DEFAULT_MESSAGE_TH[status] || 'เกิดข้อผิดพลาด';
    }

    const error =
      typeof exceptionResponse === 'object' && 'error' in exceptionResponse
        ? (exceptionResponse as any).error
        : undefined;

    response
      .status(status)
      .json(ResponseUtil.error(message, error || exception.name));
  }
}
