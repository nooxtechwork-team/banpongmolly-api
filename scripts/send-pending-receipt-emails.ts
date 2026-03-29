/**
 * กวาดส่งอีเมลใบเสร็จ (PDF) สำหรับออเดอร์ paid ที่มีอีเมลและยังไม่เคยส่ง
 *
 * รันด้วย cron เช่น ทุก 1 นาที — ดูตัวอย่างใน api/README.md
 *
 * ตัวแปร: RECEIPT_EMAIL_BATCH_LIMIT (สูงสุด 5000 ต่อรอบ — default ในโค้ด 50 ถ้าไม่ตั้ง env)
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { OrderService } from '../src/order/order.service';

async function main() {
  const logger = new Logger('send-pending-receipt-emails');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const orderService = app.get(OrderService);
    const result = await orderService.processPendingReceiptEmailBatch();
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
