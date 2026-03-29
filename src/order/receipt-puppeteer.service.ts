import {
  Injectable,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import type { Browser } from 'puppeteer';

/**
 * ใช้ Chromium ตัวเดียวร่วมกันสำหรับใบเสร็จ — ลดเวลาเทียบกับ launch/close ทุกครั้ง (~หลายวินาที → แค่ newPage + pdf)
 */
@Injectable()
export class ReceiptPuppeteerService implements OnModuleDestroy {
  private readonly logger = new Logger(ReceiptPuppeteerService.name);
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.connected) {
      return this.browser;
    }
    if (this.launching) {
      return this.launching;
    }
    this.launching = puppeteer
      .launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-renderer-backgrounding',
          '--disable-backgrounding-occluded-windows',
        ],
      })
      .then((b) => {
        this.browser = b;
        this.launching = null;
        b.on('disconnected', () => {
          this.browser = null;
        });
        this.logger.log('Puppeteer browser ready (receipt PDF)');
        return b;
      })
      .catch((err) => {
        this.launching = null;
        this.browser = null;
        throw err;
      });
    return this.launching;
  }

  /**
   * HTML ใบเสร็จเป็น inline + system font — ไม่ต้องรอ networkidle
   */
  async htmlToPdfBuffer(html: string): Promise<Uint8Array> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      const raw = await page.pdf({
        format: 'A4',
        preferCSSPageSize: true,
        printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
      });
      return raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
  }
}
