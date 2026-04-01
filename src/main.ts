import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AccessLogInterceptor } from './common/interceptors/access-log.interceptor';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { Reflector } from '@nestjs/core';
import { AuditLogService } from './audit-log/audit-log.service';
import { AccessLogService } from './access-log/access-log.service';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as bodyParser from 'body-parser';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve static files from public directory
  app.useStaticAssets(join(process.cwd(), 'public'), {
    prefix: '/',
  });

  // Enable CORS
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  // Increase JSON and URL-encoded body size limits to handle large payloads
  app.use(
    bodyParser.json({
      limit: '100mb',
    }),
  );
  app.use(
    bodyParser.urlencoded({
      limit: '100mb',
      extended: true,
    }),
  );

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global interceptors: access log + audit (สำหรับ endpoint ที่ติด @Audit) + standard response wrapper
  const reflector = app.get(Reflector);
  const auditLogService = app.get(AuditLogService);
  const accessLogService = app.get(AccessLogService);
  app.useGlobalInterceptors(
    new AccessLogInterceptor(accessLogService),
    new AuditInterceptor(reflector, auditLogService),
    new ResponseInterceptor(),
  );

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`Server is running on port ${port}`);
}
bootstrap();
