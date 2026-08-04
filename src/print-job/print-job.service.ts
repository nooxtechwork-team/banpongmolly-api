import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  PrintJob,
  PrintJobStatus,
  PrintJobType,
} from '../entities/print-job.entity';
import {
  ClaimPrintJobDto,
  CompletePrintJobDto,
  CreatePrintJobDto,
  CreateQueueTicketDto,
} from './dto/print-job.dto';

@Injectable()
export class PrintJobService {
  constructor(
    @InjectRepository(PrintJob)
    private readonly repo: Repository<PrintJob>,
    private readonly dataSource: DataSource,
  ) {}

  async createQueueTicket(dto: CreateQueueTicketDto): Promise<PrintJob> {
    const jobType = dto.job_type ?? PrintJobType.QUEUE_TICKET;
    const queueNo = await this.nextQueueNoForToday(jobType);
    const label = (dto.label || '').trim() || null;
    const payload = this.buildQueueSlip({
      queueNo,
      label,
      jobType,
    });

    const job = this.repo.create({
      job_type: jobType,
      status: PrintJobStatus.PENDING,
      queue_no: queueNo,
      payload_text: payload,
      label,
      target_device_id: dto.target_device_id?.trim() || null,
    });
    return this.repo.save(job);
  }

  async createCustom(dto: CreatePrintJobDto): Promise<PrintJob> {
    const text = (dto.payload_text || '').trim();
    if (!text) throw new BadRequestException('payload_text is required');

    const job = this.repo.create({
      job_type: dto.job_type ?? PrintJobType.CUSTOM,
      status: PrintJobStatus.PENDING,
      queue_no: null,
      payload_text: text.endsWith('\n') ? text : `${text}\n`,
      label: dto.label?.trim() || null,
      target_device_id: dto.target_device_id?.trim() || null,
    });
    return this.repo.save(job);
  }

  /**
   * บันทึกผลพิมพ์บนเครื่อง POS (local print) ลง print_jobs
   * — ได้ทั้งประวัติ และ payload สำหรับ reprint / เครื่องอื่น
   */
  async recordPosLocalPrint(opts: {
    deviceCode: string;
    queueCode: string;
    queueNo: number;
    applicantName: string | null;
    staffName: string | null;
    note: string | null;
    items: Array<{
      entry_code: string | null;
      package_name: string | null;
      registration_no: string | null;
    }>;
    status: 'done' | 'failed';
    error?: string | null;
  }): Promise<PrintJob> {
    const deviceCode = opts.deviceCode.trim();
    if (!deviceCode) throw new BadRequestException('deviceCode is required');

    const payload = this.buildFishReturnSlip({
      queueCode: opts.queueCode,
      applicantName: opts.applicantName,
      staffName: opts.staffName,
      note: opts.note,
      items: opts.items,
    });
    const now = new Date();
    const label =
      `${opts.queueCode} · ${opts.applicantName || ''}`.trim().replace(/·\s*$/, '') ||
      opts.queueCode;

    const done = opts.status === 'done';
    const job = this.repo.create({
      job_type: PrintJobType.FISH_RETURN,
      status: done ? PrintJobStatus.DONE : PrintJobStatus.FAILED,
      queue_no: opts.queueNo,
      payload_text: payload,
      label,
      target_device_id: deviceCode,
      claimed_by_device_id: deviceCode,
      claimed_at: now,
      printed_at: done ? now : null,
      attempts: 1,
      last_error: done ? null : (opts.error?.trim() || 'print failed'),
    });
    return this.repo.save(job);
  }

  async listRecent(limit = 30): Promise<PrintJob[]> {
    return this.repo.find({
      order: { id: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  async getOne(id: number): Promise<PrintJob> {
    const job = await this.repo.findOne({ where: { id } });
    if (!job) throw new NotFoundException('Print job not found');
    return job;
  }

  /**
   * Atomically claim the oldest pending job for this device.
   * Returns null when the queue is empty.
   */
  async claim(dto: ClaimPrintJobDto): Promise<PrintJob | null> {
    const deviceId = dto.device_id.trim();
    if (!deviceId) throw new BadRequestException('device_id is required');

    return this.dataSource.transaction(async (manager) => {
      const qb = manager
        .getRepository(PrintJob)
        .createQueryBuilder('j')
        .where('j.status = :status', { status: PrintJobStatus.PENDING })
        .orderBy('j.id', 'ASC')
        .setLock('pessimistic_write')
        .take(1);

      if (dto.target_device_id) {
        qb.andWhere(
          '(j.target_device_id IS NULL OR j.target_device_id = :tid)',
          { tid: dto.target_device_id },
        );
      } else {
        // Prefer untargeted jobs; also allow jobs aimed at this device
        qb.andWhere(
          '(j.target_device_id IS NULL OR j.target_device_id = :deviceId)',
          { deviceId },
        );
      }

      const job = await qb.getOne();
      if (!job) return null;

      job.status = PrintJobStatus.CLAIMED;
      job.claimed_by_device_id = deviceId;
      job.claimed_at = new Date();
      job.attempts = (job.attempts || 0) + 1;
      return manager.save(job);
    });
  }

  async complete(id: number, dto: CompletePrintJobDto): Promise<PrintJob> {
    const job = await this.getOne(id);
    const status = dto.status ?? 'done';

    if (
      job.status !== PrintJobStatus.CLAIMED &&
      job.status !== PrintJobStatus.PENDING
    ) {
      // Idempotent success if already done by same device
      if (
        job.status === PrintJobStatus.DONE &&
        job.claimed_by_device_id === dto.device_id
      ) {
        return job;
      }
      throw new BadRequestException(
        `Cannot complete job in status ${job.status}`,
      );
    }

    if (
      job.claimed_by_device_id &&
      job.claimed_by_device_id !== dto.device_id
    ) {
      throw new BadRequestException('Job claimed by another device');
    }

    if (status === 'failed') {
      job.status = PrintJobStatus.FAILED;
      job.last_error = dto.error?.trim() || 'print failed';
    } else {
      job.status = PrintJobStatus.DONE;
      job.printed_at = new Date();
      job.last_error = null;
    }
    if (!job.claimed_by_device_id) {
      job.claimed_by_device_id = dto.device_id;
      job.claimed_at = job.claimed_at || new Date();
    }
    return this.repo.save(job);
  }

  /** Re-queue a failed/claimed-stale job (desk reprint). */
  async requeue(id: number): Promise<PrintJob> {
    const job = await this.getOne(id);
    job.status = PrintJobStatus.PENDING;
    job.claimed_by_device_id = null;
    job.claimed_at = null;
    job.printed_at = null;
    job.last_error = null;
    return this.repo.save(job);
  }

  private async nextQueueNoForToday(jobType: PrintJobType): Promise<number> {
    const row = await this.repo
      .createQueryBuilder('j')
      .select('MAX(j.queue_no)', 'max')
      .where('j.job_type = :jobType', { jobType })
      .andWhere('DATE(j.created_at) = CURDATE()')
      .getRawOne<{ max: string | null }>();

    const max = row?.max != null ? Number(row.max) : 0;
    return (Number.isFinite(max) ? max : 0) + 1;
  }

  private buildQueueSlip(opts: {
    queueNo: number;
    label: string | null;
    jobType: PrintJobType;
  }): string {
    const title =
      opts.jobType === PrintJobType.FISH_RETURN
        ? 'คิวคืนปลา'
        : 'บัตรคิว';
    const now = new Date();
    const when = now.toLocaleString('th-TH', { hour12: false });
    const no = String(opts.queueNo).padStart(3, '0');
    const lines = [
      'Banpong Molly',
      title,
      '--------------------------------',
      '',
      `     หมายเลขคิว`,
      `        ${no}`,
      '',
      '--------------------------------',
    ];
    if (opts.label) {
      lines.push(opts.label);
      lines.push('--------------------------------');
    }
    lines.push(`เวลา ${when}`);
    lines.push('กรุณารอเรียกคิว');
    lines.push('================================');
    lines.push('');
    lines.push('');
    return lines.join('\n');
  }

  /**
   * ข้อความใบรับปลาคืน — ให้ตรง slip บน Sunmi POS
   * แสดง queue_code (เช่น A001) เดียวกับจอ POS
   */
  buildFishReturnSlip(opts: {
    queueCode: string;
    applicantName: string | null;
    staffName: string | null;
    note: string | null;
    items: Array<{
      entry_code: string | null;
      package_name: string | null;
      registration_no: string | null;
    }>;
  }): string {
    const when = new Date().toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const queueLabel = (opts.queueCode || '').trim() || '-';
    const customer = (opts.applicantName || '').trim() || '-';
    const lines: string[] = [
      '===============================',
      'BANPONG MOLLY',
      'ใบรับปลาคืน',
      '===============================',
      `คิว : ${queueLabel}`,
      '',
      'ลูกค้า',
      customer,
      '---------------------------------',
      'หมายเลขโหลปลา',
    ];
    if (!opts.items.length) {
      lines.push('(ไม่มีรายการ)');
    } else {
      opts.items.forEach((it, i) => {
        lines.push(`${i + 1}. ${it.entry_code || '-'}`);
      });
    }
    lines.push(`รวม ${opts.items.length} ตัว`);
    if (opts.note?.trim()) lines.push(`หมายเหตุ: ${opts.note.trim()}`);
    lines.push('---------------------------------');
    lines.push('ลงชื่อ');
    lines.push('ลูกค้า _______________');
    lines.push('');
    lines.push('เจ้าหน้าที่ _______________');
    lines.push('');
    lines.push(when);
    lines.push('===============================');
    lines.push('');
    lines.push('');
    return lines.join('\n');
  }
}
