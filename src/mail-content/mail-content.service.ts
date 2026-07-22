import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { In, IsNull, Not, Repository } from 'typeorm';
import {
  MailContent,
  MailContentStatus,
  MailContentToMode,
} from '../entities/mail-content.entity';
import {
  MailContentRecipient,
  MailRecipientStatus,
} from '../entities/mail-content-recipient.entity';
import { User } from '../entities/user.entity';
import { CreateMailContentDto } from './dto/create-mail-content.dto';
import { UpdateMailContentDto } from './dto/update-mail-content.dto';
import {
  MAIL_CONTENT_SEND_QUEUE,
  type MailContentSendJobData,
} from './mail-content.constants';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const PLACEHOLDER_EMAIL_SUFFIX = '@line.local';
const SEND_BATCH_HARD_MAX = 5000;

function parseEmailList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const parts = raw
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const email of parts) {
    if (!EMAIL_RE.test(email)) continue;
    if (email.endsWith(PLACEHOLDER_EMAIL_SUFFIX)) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
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

@Injectable()
export class MailContentService {
  private readonly logger = new Logger(MailContentService.name);

  constructor(
    @InjectRepository(MailContent)
    private readonly mailContentRepo: Repository<MailContent>,
    @InjectRepository(MailContentRecipient)
    private readonly recipientRepo: Repository<MailContentRecipient>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectQueue(MAIL_CONTENT_SEND_QUEUE)
    private readonly sendQueue: Queue<MailContentSendJobData>,
  ) {}

  async listAdmin(params: {
    page: number;
    limit: number;
    status?: MailContentStatus | 'all';
    search?: string;
  }) {
    const qb = this.mailContentRepo
      .createQueryBuilder('m')
      .orderBy('m.created_at', 'DESC');

    if (params.status && params.status !== 'all') {
      qb.andWhere('m.status = :status', { status: params.status });
    }
    if (params.search?.trim()) {
      const q = `%${params.search.trim()}%`;
      qb.andWhere(
        '(m.subject LIKE :q OR m.name LIKE :q OR m.to_emails LIKE :q OR m.cc_emails LIKE :q)',
        { q },
      );
    }

    const total = await qb.getCount();
    const items = await qb
      .skip((params.page - 1) * params.limit)
      .take(params.limit)
      .getMany();

    return { items, total };
  }

  async findOneById(id: number): Promise<MailContent> {
    const entity = await this.mailContentRepo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('ไม่พบเนื้อหาอีเมลนี้');
    }
    return entity;
  }

  async create(
    dto: CreateMailContentDto,
    createdByUserId?: number,
  ): Promise<MailContent> {
    const entity = this.mailContentRepo.create();
    this.applyDto(entity, dto);
    entity.status = MailContentStatus.DRAFT;
    entity.created_by_user_id = createdByUserId ?? null;
    return this.mailContentRepo.save(entity);
  }

  async update(id: number, dto: UpdateMailContentDto): Promise<MailContent> {
    const entity = await this.findOneById(id);
    if (
      entity.status === MailContentStatus.SENDING ||
      entity.status === MailContentStatus.QUEUED
    ) {
      throw new BadRequestException('กำลังส่งอีเมลอยู่ แก้ไขไม่ได้ในขณะนี้');
    }
    this.applyDto(entity, dto);
    return this.mailContentRepo.save(entity);
  }

  async remove(id: number): Promise<void> {
    const entity = await this.findOneById(id);
    if (
      entity.status === MailContentStatus.SENDING ||
      entity.status === MailContentStatus.QUEUED
    ) {
      throw new BadRequestException('กำลังส่งอีเมลอยู่ ลบไม่ได้ในขณะนี้');
    }
    await this.mailContentRepo.remove(entity);
  }

  async previewRecipients(params: {
    to_mode: MailContentToMode;
    to_emails?: string;
  }) {
    const emails = await this.resolveRecipients(params.to_mode, params.to_emails);
    return {
      count: emails.length,
      sample: emails.slice(0, 10),
    };
  }

  async listRecipients(
    mailContentId: number,
    params: {
      page: number;
      limit: number;
      status?: MailRecipientStatus | 'all';
      search?: string;
    },
  ) {
    await this.findOneById(mailContentId);

    const qb = this.recipientRepo
      .createQueryBuilder('r')
      .where('r.mail_content_id = :mailContentId', { mailContentId })
      .orderBy('r.id', 'ASC');

    if (params.status && params.status !== 'all') {
      qb.andWhere('r.status = :status', { status: params.status });
    }
    if (params.search?.trim()) {
      qb.andWhere('r.email LIKE :q', { q: `%${params.search.trim()}%` });
    }

    const total = await qb.getCount();
    const items = await qb
      .skip((params.page - 1) * params.limit)
      .take(params.limit)
      .getMany();

    const summaryRaw = await this.recipientRepo
      .createQueryBuilder('r')
      .select('r.status', 'status')
      .addSelect('COUNT(1)', 'count')
      .where('r.mail_content_id = :mailContentId', { mailContentId })
      .groupBy('r.status')
      .getRawMany<{ status: MailRecipientStatus; count: string }>();

    const summary = {
      pending: 0,
      sending: 0,
      sent: 0,
      failed: 0,
    };
    for (const row of summaryRaw) {
      summary[row.status] = Number(row.count) || 0;
    }

    return { items, total, summary };
  }

  /** ใช้ row เดิมต่อ recipient — ส่งซ้ำจะ reset สถานะ (ไม่สร้าง row ใหม่) */
  async enqueueSend(id: number): Promise<MailContent> {
    const entity = await this.findOneById(id);
    if (
      entity.status === MailContentStatus.SENDING ||
      entity.status === MailContentStatus.QUEUED
    ) {
      throw new BadRequestException('กำลังส่งอีเมลนี้อยู่แล้ว');
    }
    if (!entity.subject?.trim()) {
      throw new BadRequestException('กรุณาระบุหัวข้ออีเมล');
    }
    if (!entity.content_html?.trim()) {
      throw new BadRequestException('กรุณาระบุเนื้อหาอีเมล');
    }

    const emails = await this.resolveRecipients(
      entity.to_mode,
      entity.to_emails,
    );
    if (!emails.length) {
      throw new BadRequestException(
        entity.to_mode === MailContentToMode.ALL_USERS
          ? 'ไม่พบอีเมลผู้ใช้งานที่ส่งได้ (ข้ามอีเมลปลอม @line.local)'
          : 'กรุณาระบุอีเมลผู้รับอย่างน้อย 1 ที่อยู่',
      );
    }
    if (emails.length > SEND_BATCH_HARD_MAX) {
      throw new BadRequestException(
        `จำนวนผู้รับเกินเพดาน ${SEND_BATCH_HARD_MAX.toLocaleString('th-TH')} ที่อยู่ต่อครั้ง`,
      );
    }

    const nextVersion = entity.current_send_round + 1;
    const attachCcAll = entity.to_mode === MailContentToMode.MANUAL;

    const existing = await this.recipientRepo.find({
      where: { mail_content_id: id },
    });
    const byEmail = new Map(existing.map((r) => [r.email, r]));
    const emailSet = new Set(emails);

    const orphanIds = existing
      .filter((r) => !emailSet.has(r.email))
      .map((r) => r.id);
    if (orphanIds.length) {
      await this.recipientRepo.delete({ id: In(orphanIds) });
    }

    const toSave: MailContentRecipient[] = [];
    for (let index = 0; index < emails.length; index++) {
      const email = emails[index];
      const row = byEmail.get(email);
      if (row) {
        row.status = MailRecipientStatus.PENDING;
        row.attach_cc = attachCcAll || index === 0;
        row.error_message = null;
        row.attempts = 0;
        row.sent_at = null;
        toSave.push(row);
      } else {
        toSave.push(
          this.recipientRepo.create({
            mail_content_id: id,
            email,
            status: MailRecipientStatus.PENDING,
            attach_cc: attachCcAll || index === 0,
            error_message: null,
            attempts: 0,
            sent_at: null,
          }),
        );
      }
    }

    const chunkSize = 500;
    const saved: MailContentRecipient[] = [];
    for (let i = 0; i < toSave.length; i += chunkSize) {
      const chunk = await this.recipientRepo.save(toSave.slice(i, i + chunkSize));
      saved.push(...chunk);
    }

    entity.status = MailContentStatus.QUEUED;
    entity.current_send_round = nextVersion;
    entity.recipient_count = saved.length;
    entity.sent_count = 0;
    entity.failed_count = 0;
    entity.last_error = null;
    entity.sent_at = null;
    await this.mailContentRepo.save(entity);

    const jobs = saved.map((r) => ({
      name: 'send-one',
      data: {
        recipientId: r.id,
        mailContentId: id,
        sendRound: nextVersion,
      } satisfies MailContentSendJobData,
      opts: {
        jobId: `mail-${id}-v${nextVersion}-recipient-${r.id}`,
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 2000 },
      },
    }));

    for (let i = 0; i < jobs.length; i += chunkSize) {
      await this.sendQueue.addBulk(jobs.slice(i, i + chunkSize));
    }

    this.logger.log(
      `Mail content #${id} v${nextVersion}: queued ${saved.length} recipients (reuse rows)`,
    );
    return entity;
  }

  async retryFailed(id: number): Promise<MailContent> {
    const entity = await this.findOneById(id);
    if (
      entity.status === MailContentStatus.SENDING ||
      entity.status === MailContentStatus.QUEUED
    ) {
      throw new BadRequestException('กำลังส่งอีเมลอยู่ รอให้จบก่อนแล้วค่อย retry');
    }
    if (!entity.current_send_round) {
      throw new BadRequestException('ยังไม่เคยส่ง ไม่มีรายการให้ retry');
    }

    const failed = await this.recipientRepo.find({
      where: {
        mail_content_id: id,
        status: MailRecipientStatus.FAILED,
      },
    });
    if (!failed.length) {
      throw new BadRequestException('ไม่มีรายการที่ล้มเหลว');
    }

    await this.recipientRepo.update(
      { id: In(failed.map((r) => r.id)) },
      {
        status: MailRecipientStatus.PENDING,
        error_message: null,
        sent_at: null,
      },
    );

    entity.failed_count = Math.max(0, entity.failed_count - failed.length);
    entity.status = MailContentStatus.QUEUED;
    entity.last_error = null;
    await this.mailContentRepo.save(entity);

    const version = entity.current_send_round;
    const jobs = failed.map((r) => ({
      name: 'send-one',
      data: {
        recipientId: r.id,
        mailContentId: id,
        sendRound: version,
      } satisfies MailContentSendJobData,
      opts: {
        jobId: `mail-${id}-v${version}-recipient-${r.id}-retry-${Date.now()}`,
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 2000 },
      },
    }));

    await this.sendQueue.addBulk(jobs);
    return entity;
  }

  private applyDto(
    entity: MailContent,
    dto: CreateMailContentDto | UpdateMailContentDto,
  ) {
    if (dto.name !== undefined) {
      entity.name = dto.name?.trim() || null;
    }
    if (dto.subject !== undefined) {
      entity.subject = dto.subject.trim();
    }
    if (dto.content_html !== undefined) {
      entity.content_html = dto.content_html;
      if (dto.content_text === undefined) {
        entity.content_text = htmlToPlainText(dto.content_html) || null;
      }
    }
    if (dto.content_text !== undefined) {
      entity.content_text = dto.content_text?.trim() || null;
    }
    if (dto.to_mode !== undefined) {
      entity.to_mode = dto.to_mode;
    }
    if (dto.to_emails !== undefined) {
      entity.to_emails = dto.to_emails?.trim() || null;
    }
    if (dto.cc_emails !== undefined) {
      entity.cc_emails = dto.cc_emails?.trim() || null;
    }
    if (dto.note !== undefined) {
      entity.note = dto.note?.trim() || null;
    }

    if (!entity.to_mode) {
      entity.to_mode = MailContentToMode.MANUAL;
    }
  }

  private async resolveRecipients(
    toMode: MailContentToMode,
    toEmails?: string | null,
  ): Promise<string[]> {
    if (toMode === MailContentToMode.MANUAL) {
      return parseEmailList(toEmails);
    }

    const users = await this.userRepo.find({
      select: ['email'],
      where: {
        email: Not(IsNull()),
      },
      withDeleted: false,
    });

    const seen = new Set<string>();
    const out: string[] = [];
    for (const u of users) {
      const email = (u.email || '').trim().toLowerCase();
      if (!email || !EMAIL_RE.test(email)) continue;
      if (email.endsWith(PLACEHOLDER_EMAIL_SUFFIX)) continue;
      if (seen.has(email)) continue;
      seen.add(email);
      out.push(email);
    }
    return out;
  }
}
