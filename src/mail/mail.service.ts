import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: Transporter | null = null;
  private readonly logger = new Logger(MailService.name);

  constructor(private configService: ConfigService) {
    const host = this.configService.get<string>('MAIL_HOST');
    const port = Number(this.configService.get<string>('MAIL_PORT')) || 465;
    const user = this.configService.get<string>('MAIL_USERNAME');
    const pass = this.configService.get<string>('MAIL_PASSWORD');
    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        connectionTimeout: 15000,
        greetingTimeout: 10000,
      });
    }
  }

  /** @returns true ถ้าส่งจริง, false ถ้าไม่ได้ตั้งค่า SMTP (ข้าม) */
  async sendRawEmail(options: {
    to: string;
    subject: string;
    text?: string;
    html?: string;
    attachments?: { filename: string; content: Buffer | string }[];
  }): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn('Mail not configured, skipping email');
      return false;
    }
    try {
      await this.transporter.sendMail({
        from: this.configService.get<string>('MAIL_USERNAME'),
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments,
      });
      return true;
    } catch (err) {
      this.logger.error(
        `Failed to send email to ${options.to}: ${
          err instanceof Error ? err.message : err
        }`,
      );
      throw err;
    }
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    if (!this.transporter) {
      this.logger.warn('Mail not configured, skipping verification email');
      return;
    }
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const verifyUrl = `${frontendUrl}/confirm-email?token=${encodeURIComponent(token)}`;
    try {
      await this.transporter.sendMail({
        from: this.configService.get<string>('MAIL_USERNAME'),
        to,
        subject: 'ยืนยันอีเมลของคุณ - Banpong Molly',
        text: `กรุณาคลิกลิงก์ด้านล่างเพื่อยืนยันอีเมล:\n${verifyUrl}`,
        html: `
        <p>สวัสดีครับ/ค่ะ</p>
        <p>กรุณาคลิกลิงก์ด้านล่างเพื่อยืนยันอีเมลของคุณ:</p>
        <p><a href="${verifyUrl}">ยืนยันอีเมล</a></p>
        <p>ลิงก์มีอายุ 24 ชั่วโมง</p>
      `,
      });
    } catch (err) {
      this.logger.error(
        `Failed to send verification email to ${to}: ${err instanceof Error ? err.message : err}`,
      );
      throw err;
    }
  }
}
