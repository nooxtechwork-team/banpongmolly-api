import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { In, Repository } from 'typeorm';
import {
  MailContent,
  MailContentStatus,
} from '../entities/mail-content.entity';
import {
  MailContentRecipient,
  MailRecipientStatus,
} from '../entities/mail-content-recipient.entity';
import { MailService } from '../mail/mail.service';
import {
  MAIL_CONTENT_SEND_QUEUE,
  type MailContentSendJobData,
} from './mail-content.constants';

function parseEmailList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const parts = raw
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(parts)];
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

@Processor(MAIL_CONTENT_SEND_QUEUE, {
  concurrency: 3,
})
export class MailContentSendProcessor extends WorkerHost {
  private readonly logger = new Logger(MailContentSendProcessor.name);

  constructor(
    @InjectRepository(MailContentRecipient)
    private readonly recipientRepo: Repository<MailContentRecipient>,
    @InjectRepository(MailContent)
    private readonly mailContentRepo: Repository<MailContent>,
    private readonly mailService: MailService,
  ) {
    super();
  }

  async process(job: Job<MailContentSendJobData>): Promise<void> {
    const { recipientId, mailContentId, sendRound } = job.data;

    const mail = await this.mailContentRepo.findOne({
      where: { id: mailContentId },
    });
    if (!mail || mail.current_send_round !== sendRound) {
      return;
    }

    const recipient = await this.recipientRepo.findOne({
      where: { id: recipientId },
    });
    if (!recipient) {
      this.logger.warn(`Recipient #${recipientId} not found — skip`);
      return;
    }
    if (recipient.status === MailRecipientStatus.SENT) {
      return;
    }

    if (mail.status === MailContentStatus.QUEUED) {
      await this.mailContentRepo.update(mail.id, {
        status: MailContentStatus.SENDING,
      });
    }

    await this.recipientRepo.update(recipientId, {
      status: MailRecipientStatus.SENDING,
      attempts: recipient.attempts + 1,
      error_message: null,
    });

    const text = mail.content_text?.trim() || htmlToPlainText(mail.content_html);
    const ccList = recipient.attach_cc ? parseEmailList(mail.cc_emails) : [];

    try {
      const ok = await this.mailService.sendRawEmail({
        to: recipient.email,
        subject: mail.subject,
        html: mail.content_html,
        text,
        cc: ccList.length ? ccList : undefined,
      });

      if (!ok) {
        await this.markFailed(
          recipientId,
          mail.id,
          sendRound,
          'ยังไม่ได้ตั้งค่า SMTP — ข้ามการส่ง',
        );
        return;
      }

      await this.recipientRepo.update(recipientId, {
        status: MailRecipientStatus.SENT,
        sent_at: new Date(),
        error_message: null,
      });
      await this.syncStats(mailContentId, sendRound);
      await this.finalizeIfDone(mailContentId, sendRound);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Mail content #${mail.id} v${sendRound} → ${recipient.email}: ${message}`,
      );
      await this.markFailed(recipientId, mail.id, sendRound, message);
    }
  }

  private async markFailed(
    recipientId: number,
    mailContentId: number,
    sendRound: number,
    message: string,
  ) {
    await this.recipientRepo.update(recipientId, {
      status: MailRecipientStatus.FAILED,
      error_message: message.slice(0, 2000),
    });
    await this.mailContentRepo.update(mailContentId, {
      last_error: message.slice(0, 2000),
    });
    await this.syncStats(mailContentId, sendRound);
    await this.finalizeIfDone(mailContentId, sendRound);
  }

  private async syncStats(mailContentId: number, sendRound: number) {
    const mail = await this.mailContentRepo.findOne({
      where: { id: mailContentId },
    });
    if (!mail || mail.current_send_round !== sendRound) return;

    const sent = await this.recipientRepo.count({
      where: {
        mail_content_id: mailContentId,
        status: MailRecipientStatus.SENT,
      },
    });
    const failed = await this.recipientRepo.count({
      where: {
        mail_content_id: mailContentId,
        status: MailRecipientStatus.FAILED,
      },
    });

    await this.mailContentRepo.update(mailContentId, {
      sent_count: sent,
      failed_count: failed,
    });
  }

  private async finalizeIfDone(mailContentId: number, sendRound: number) {
    const mail = await this.mailContentRepo.findOne({
      where: { id: mailContentId },
    });
    if (!mail || mail.current_send_round !== sendRound) return;

    const remaining = await this.recipientRepo.count({
      where: {
        mail_content_id: mailContentId,
        status: In([MailRecipientStatus.PENDING, MailRecipientStatus.SENDING]),
      },
    });
    if (remaining > 0) return;

    const failed = await this.recipientRepo.count({
      where: {
        mail_content_id: mailContentId,
        status: MailRecipientStatus.FAILED,
      },
    });
    const sent = await this.recipientRepo.count({
      where: {
        mail_content_id: mailContentId,
        status: MailRecipientStatus.SENT,
      },
    });

    await this.mailContentRepo.update(mailContentId, {
      sent_count: sent,
      failed_count: failed,
      sent_at: new Date(),
      status:
        sent === 0 && failed > 0
          ? MailContentStatus.FAILED
          : MailContentStatus.SENT,
    });
  }
}
