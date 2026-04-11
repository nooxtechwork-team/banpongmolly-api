/**
 * กวาดส่งอีเมลแจ้งเจ้าหน้าที่เมื่อผู้สมัครกดขอแจ้งเตือน checkout (คืนปลา)
 * อ่านอีเมลปลายทางจาก payment_configs.checkout_request_notify_email (หลายที่อยู่คั่นด้วย comma / ; / ขึ้นบรรทัด)
 * บันทึกเวลาส่งใน entries_json[].checkout_request_email_sent_at
 *
 * รันด้วย cron เช่น ทุก 1 นาที — ดูตัวอย่างใน api/README.md
 *
 * ตัวแปร: CHECKOUT_REQUEST_EMAIL_BATCH_LIMIT (default 50 ถ้าไม่ตั้ง env)
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { OrderService } from '../src/order/order.service';

async function main() {
  const logger = new Logger('send-pending-checkout-request-emails');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const orderService = app.get(OrderService);
    const result = await orderService.processPendingCheckoutRequestEmailBatch();
    logger.log(
      `candidates=${result.candidates} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`,
    );
    if (result.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
