import { randomBytes } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import {
  CheckoutDevice,
  CheckoutDeviceStatus,
} from '../entities/checkout-device.entity';
import {
  CheckoutTicket,
  CheckoutTicketStatus,
} from '../entities/checkout-ticket.entity';
import { CheckoutTicketItem } from '../entities/checkout-ticket-item.entity';
import { CheckoutTicketEvent } from '../entities/checkout-ticket-event.entity';
import { ActivityRegistration } from '../entities/activity-registration.entity';
import { ActivityRegistrationEntry } from '../entities/activity-registration-entry.entity';
import { Activity } from '../entities/activity.entity';
import { Order, OrderStatus, OrderType } from '../entities/order.entity';
import { User, UserRole } from '../entities/user.entity';
import { ActivityPackageService } from '../activity-package/activity-package.service';
import {
  CheckoutQueueGateway,
  type CheckoutBoardPayload,
} from './checkout-queue.gateway';
import type {
  AdminCompleteCheckoutTicketDto,
  CancelCheckoutTicketDto,
  ClaimNextCheckoutQueueDto,
  CreateCheckoutTicketDto,
  CheckoutQueueTransitionDto,
  UpdateCheckoutDeviceDto,
  UpsertCheckoutDeviceDto,
} from './dto/checkout-queue.dto';

const ACTIVE_TICKET_STATUSES = [
  CheckoutTicketStatus.WAITING,
  CheckoutTicketStatus.PREPARING,
  CheckoutTicketStatus.READY,
] as const;

/** เครื่องไม่มี heartbeat → ถือว่า offline (ยังไม่คืนคิวทันที) */
const DEVICE_OFFLINE_MS = 60_000;
/**
 * คืนคิว preparing กลับ waiting เมื่อเครื่องเงียบจริง ๆ
 * ต้องยาวพอให้ staff เดินไปหยิบปลาได้ (เดิม 30–90 วิ สั้นเกินไป)
 */
const TICKET_RECLAIM_PREPARING_MS = 15 * 60_000;
const RECLAIM_INTERVAL_MS = 15_000;
const QUEUE_CODE_PREFIX = 'A';

export type CheckoutTicketDetail = {
  id: number;
  activity_id: number;
  user_id: number;
  queue_no: number;
  queue_date: string;
  queue_code: string;
  status: CheckoutTicketStatus;
  device_id: number | null;
  device_code: string | null;
  staff_user_id: number | null;
  staff_name: string | null;
  note: string | null;
  cancel_reason: string | null;
  requested_at: string;
  preparing_at: string | null;
  ready_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  /** ชื่อผู้สมัครจาก item แรก (อาจหลายใบสมัคร) */
  applicant_name: string | null;
  position: number | null;
  items: Array<{
    id: number;
    registration_id: number;
    registration_no: string | null;
    applicant_name: string | null;
    entry_id: number;
    entry_code: string | null;
    package_name: string | null;
  }>;
};

/** 1 แถวในตารางคิวฝั่งแอดมิน (หน้า dashboard คิวเรียลไทม์) */
export type AdminCheckoutTicketRow = {
  id: number;
  queue_no: number;
  queue_code: string;
  queue_date: string;
  status: CheckoutTicketStatus;
  user_id: number;
  applicant_name: string | null;
  registration_no: string | null;
  farm_name: string | null;
  items_count: number;
  item_codes: string[];
  device_id: number | null;
  device_code: string | null;
  staff_name: string | null;
  note: string | null;
  cancel_reason: string | null;
  requested_at: string;
  preparing_at: string | null;
  ready_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  /** ลำดับในคิวที่รออยู่ (เฉพาะสถานะ waiting) */
  position: number | null;
};

export type MyCheckoutEntryTicket = {
  id: number;
  queue_code: string;
  status: CheckoutTicketStatus;
};

/** ปลา 1 ตัวของผู้ใช้ (entry) สำหรับหน้า dashboard คืนปลาฝั่งลูกค้า */
export type MyCheckoutEntry = {
  entry_id: number;
  registration_id: number;
  registration_no: string | null;
  applicant_name: string | null;
  farm_name: string | null;
  activity_id: number;
  activity_title: string;
  entry_index: string | null;
  entry_code: string | null;
  package_name: string | null;
  /** เจ้าหน้าที่มาร์คว่าพร้อมคืน — บังคับต้องเป็น true ก่อนขอคิว */
  ready_to_checkout: boolean;
  checked_in_at: string | null;
  checked_out_at: string | null;
  checked_out_by_name: string | null;
  checkout_requested_at: string | null;
  checkout_remark: string | null;
  /** คิวที่ปลาตัวนี้อยู่ (waiting/preparing/ready) */
  ticket: MyCheckoutEntryTicket | null;
  /** เลือกขอคืนได้หรือไม่ */
  can_request: boolean;
  blocked_reason: string | null;
};

export type MyCheckoutCounts = {
  total: number;
  requestable: number;
  in_queue: number;
  ready: number;
  checked_out: number;
};

export type MyCheckoutActivitySummary = {
  activity_id: number;
  title: string;
  slug: string;
  start_date: string;
  end_date: string;
} & MyCheckoutCounts;

export type MyCheckoutEntriesResult = {
  activities: MyCheckoutActivitySummary[];
  entries: MyCheckoutEntry[];
  counts: MyCheckoutCounts;
};

type MyCheckoutEntryRaw = {
  entry_id: number;
  registration_id: number;
  registration_no: string | null;
  applicant_name: string | null;
  farm_name: string | null;
  activity_id: number;
  activity_title: string;
  activity_slug: string;
  activity_start_date: string | Date;
  activity_end_date: string | Date;
  entry_index: string | null;
  entry_code: string | null;
  package_id: number;
  ready_to_checkout: number | boolean | null;
  checked_in_at: Date | string | null;
  checked_out_at: Date | string | null;
  checked_out_by_name: string | null;
  checkout_requested_at: Date | string | null;
  checkout_remark: string | null;
};

@Injectable()
export class CheckoutQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CheckoutQueueService.name);
  private reclaimTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(CheckoutDevice)
    private readonly deviceRepo: Repository<CheckoutDevice>,
    @InjectRepository(CheckoutTicket)
    private readonly ticketRepo: Repository<CheckoutTicket>,
    @InjectRepository(CheckoutTicketItem)
    private readonly itemRepo: Repository<CheckoutTicketItem>,
    @InjectRepository(CheckoutTicketEvent)
    private readonly eventRepo: Repository<CheckoutTicketEvent>,
    @InjectRepository(ActivityRegistration)
    private readonly registrationRepo: Repository<ActivityRegistration>,
    @InjectRepository(ActivityRegistrationEntry)
    private readonly entryRepo: Repository<ActivityRegistrationEntry>,
    @InjectRepository(Activity)
    private readonly activityRepo: Repository<Activity>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly dataSource: DataSource,
    private readonly activityPackageService: ActivityPackageService,
    private readonly gateway: CheckoutQueueGateway,
  ) {}

  onModuleInit(): void {
    this.reclaimTimer = setInterval(() => {
      void this.reclaimStaleDevices().catch((err) => {
        this.logger.warn(
          `reclaimStaleDevices failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }, RECLAIM_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.reclaimTimer) {
      clearInterval(this.reclaimTimer);
      this.reclaimTimer = null;
    }
  }

  // ─── Devices (admin) ───────────────────────────────────────────────

  async listDevices(activityId?: number): Promise<CheckoutDevice[]> {
    if (activityId == null) {
      return this.deviceRepo.find({ order: { device_code: 'ASC' } });
    }
    return this.deviceRepo.find({
      where: [{ activity_id: activityId }, { activity_id: IsNull() }],
      order: { device_code: 'ASC' },
    });
  }

  async createDevice(dto: UpsertCheckoutDeviceDto): Promise<CheckoutDevice> {
    const code = dto.device_code.trim().toUpperCase();
    if (!code) throw new BadRequestException('device_code is required');
    const existing = await this.deviceRepo.findOne({
      where: { device_code: code },
    });
    if (existing) {
      throw new ConflictException(`device_code ${code} already exists`);
    }
    if (dto.activity_id != null) {
      await this.requireActivity(dto.activity_id);
    }
    const apiKey = dto.api_key?.trim() || this.generateApiKey();
    await this.assertApiKeyUnique(apiKey);
    const device = this.deviceRepo.create({
      device_code: code,
      name: dto.name.trim() || code,
      activity_id: dto.activity_id ?? null,
      is_active: dto.is_active ?? true,
      api_key: apiKey,
      status: CheckoutDeviceStatus.OFFLINE,
      current_ticket_id: null,
      last_heartbeat_at: null,
      last_heartbeat_ms: null,
    });
    return this.deviceRepo.save(device);
  }

  async updateDevice(
    id: number,
    dto: UpdateCheckoutDeviceDto,
  ): Promise<CheckoutDevice> {
    const device = await this.requireDeviceById(id);
    if (dto.name != null) device.name = dto.name.trim() || device.name;
    if (dto.activity_id !== undefined) {
      if (dto.activity_id != null) await this.requireActivity(dto.activity_id);
      device.activity_id = dto.activity_id;
    }
    if (dto.is_active != null) device.is_active = dto.is_active;
    if (dto.api_key !== undefined) {
      const key = dto.api_key.trim();
      if (key) {
        await this.assertApiKeyUnique(key, device.id);
        device.api_key = key;
      }
    }
    return this.deviceRepo.save(device);
  }

  /** ออก API key ใหม่ให้เครื่อง (rotate) — คีย์เดิมจะใช้ไม่ได้ทันที */
  async rotateDeviceKey(id: number): Promise<CheckoutDevice> {
    const device = await this.requireDeviceById(id);
    device.api_key = this.generateApiKey();
    return this.deviceRepo.save(device);
  }

  // ─── User: request ticket ──────────────────────────────────────────

  async createTicket(
    user: User,
    dto: CreateCheckoutTicketDto,
  ): Promise<CheckoutTicketDetail> {
    await this.requireActivity(dto.activity_id);

    const entryIds = [...new Set(dto.entry_ids.map(Number).filter((n) => n > 0))];
    if (!entryIds.length) {
      throw new BadRequestException('กรุณาระบุ entry_ids');
    }

    const entries = await this.entryRepo.find({
      where: { id: In(entryIds) },
    });
    if (entries.length !== entryIds.length) {
      throw new BadRequestException('พบ entry ที่ไม่ถูกต้อง');
    }

    const registrationIds = [
      ...new Set(entries.map((e) => Number(e.registration_id))),
    ];
    const registrations = await this.registrationRepo.find({
      where: { id: In(registrationIds) },
    });
    if (registrations.length !== registrationIds.length) {
      throw new NotFoundException('ไม่พบใบสมัครของบางรายการ');
    }
    const regMap = new Map(registrations.map((r) => [r.id, r]));

    const ownerUserIds = [
      ...new Set(
        registrations
          .map((r) => r.user_id)
          .filter((id): id is number => id != null && id > 0),
      ),
    ];
    if (ownerUserIds.length !== 1) {
      throw new BadRequestException(
        'ทุกรายการต้องเป็นของเจ้าของบัญชีเดียวกัน',
      );
    }
    const ownerUserId = ownerUserIds[0]!;
    if (user.role !== UserRole.ADMIN && ownerUserId !== user.id) {
      throw new BadRequestException('ไม่มีสิทธิ์ขอคิวสำหรับใบสมัครนี้');
    }

    for (const reg of registrations) {
      if (reg.activity_id !== dto.activity_id) {
        throw new BadRequestException(
          'ทุกรายการต้องอยู่ในกิจกรรมเดียวกัน',
        );
      }
      if (!reg.checked_in_at) {
        throw new BadRequestException(
          `ใบสมัคร ${reg.registration_no} ต้องเช็คอินที่งานก่อน`,
        );
      }
    }

    const paidOrders = await this.orderRepo.find({
      where: {
        refer_id: In(registrationIds),
        type: OrderType.ACTIVITY_REGISTRATION,
        status: OrderStatus.PAID,
      },
    });
    const paidRegIds = new Set(paidOrders.map((o) => o.refer_id));
    for (const regId of registrationIds) {
      if (!paidRegIds.has(regId)) {
        const reg = regMap.get(regId)!;
        throw new BadRequestException(
          `ใบสมัคร ${reg.registration_no} ต้องชำระเงินแล้ว`,
        );
      }
    }

    for (const entry of entries) {
      if (entry.checked_out_at) {
        throw new BadRequestException(
          `รายการ ${entry.entry_code || entry.id} checkout แล้ว`,
        );
      }
      if (!entry.ready_to_checkout) {
        throw new BadRequestException(
          `รายการ ${entry.entry_code || entry.id} ยังไม่ถูกมาร์คว่าพร้อมคืน`,
        );
      }
    }

    const activeItems = await this.itemRepo
      .createQueryBuilder('item')
      .innerJoin(CheckoutTicket, 't', 't.id = item.ticket_id')
      .where('item.entry_id IN (:...entryIds)', { entryIds })
      .andWhere('t.status IN (:...statuses)', {
        statuses: [...ACTIVE_TICKET_STATUSES],
      })
      .getCount();
    if (activeItems > 0) {
      throw new ConflictException('มีรายการที่อยู่ในคิวคืนปลาอยู่แล้ว');
    }

    const packageIds = [...new Set(entries.map((e) => Number(e.package_id)))];
    const packageNames =
      await this.activityPackageService.findLeafNamesByIds(packageIds);

    const now = new Date();
    const queueDate = this.toQueueDate(now);

    const ticket = await this.dataSource.transaction(async (manager) => {
      const ticketRepo = manager.getRepository(CheckoutTicket);
      const itemRepo = manager.getRepository(CheckoutTicketItem);
      const eventRepo = manager.getRepository(CheckoutTicketEvent);
      const entryRepo = manager.getRepository(ActivityRegistrationEntry);

      await manager.getRepository(Activity).findOne({
        where: { id: dto.activity_id },
        lock: { mode: 'pessimistic_write' },
      });

      const queueNo = await this.nextQueueNoInTx(
        manager.getRepository(CheckoutTicket),
        dto.activity_id,
        queueDate,
      );
      const queueCode = this.formatQueueCode(queueNo);

      const created = ticketRepo.create({
        activity_id: dto.activity_id,
        user_id: ownerUserId,
        queue_no: queueNo,
        queue_date: queueDate,
        queue_code: queueCode,
        status: CheckoutTicketStatus.WAITING,
        device_id: null,
        staff_user_id: null,
        staff_name: null,
        note: dto.note?.trim() || null,
        cancel_reason: null,
        requested_at: now,
        preparing_at: null,
        ready_at: null,
        completed_at: null,
        cancelled_at: null,
      });
      const saved = await ticketRepo.save(created);

      await itemRepo.save(
        entries.map((entry) =>
          itemRepo.create({
            ticket_id: saved.id,
            registration_id: entry.registration_id,
            entry_id: entry.id,
            entry_code: entry.entry_code,
            package_name: packageNames.get(Number(entry.package_id)) ?? null,
          }),
        ),
      );

      for (const entry of entries) {
        entry.checkout_requested_at = now;
        if (dto.note?.trim()) {
          entry.checkout_request_note = dto.note.trim();
        }
      }
      await entryRepo.save(entries);

      await eventRepo.save(
        eventRepo.create({
          ticket_id: saved.id,
          from_status: null,
          to_status: CheckoutTicketStatus.WAITING,
          actor_user_id: user.id,
          device_id: null,
          meta_json: JSON.stringify({
            entry_ids: entryIds,
            registration_ids: registrationIds,
          }),
        }),
      );

      return saved;
    });

    const detail = await this.getTicketDetail(ticket.id);
    await this.emitLive(detail);
    return detail;
  }

  async cancelTicket(
    ticketId: number,
    actor: { userId: number; isAdmin: boolean },
    dto: CancelCheckoutTicketDto,
  ): Promise<CheckoutTicketDetail> {
    const ticket = await this.requireTicketById(ticketId);
    if (!actor.isAdmin && ticket.user_id !== actor.userId) {
      throw new BadRequestException('ไม่มีสิทธิ์ยกเลิกคิวนี้');
    }
    if (ticket.status !== CheckoutTicketStatus.WAITING) {
      throw new BadRequestException('ยกเลิกได้เฉพาะคิวที่รออยู่');
    }

    const now = new Date();
    await this.dataSource.transaction(async (manager) => {
      const ticketRepo = manager.getRepository(CheckoutTicket);
      const eventRepo = manager.getRepository(CheckoutTicketEvent);
      const itemRepo = manager.getRepository(CheckoutTicketItem);
      const entryRepo = manager.getRepository(ActivityRegistrationEntry);

      const locked = await ticketRepo.findOne({
        where: { id: ticket.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked || locked.status !== CheckoutTicketStatus.WAITING) {
        throw new ConflictException('สถานะคิวเปลี่ยนแล้ว');
      }

      locked.status = CheckoutTicketStatus.CANCELLED;
      locked.cancel_reason = dto.reason?.trim() || null;
      locked.cancelled_at = now;
      await ticketRepo.save(locked);

      const items = await itemRepo.find({ where: { ticket_id: locked.id } });
      if (items.length) {
        const entries = await entryRepo.find({
          where: { id: In(items.map((i) => i.entry_id)) },
        });
        for (const entry of entries) {
          entry.ready_to_checkout = false;
          // keep checkout_requested_at history; clear only ready flag
        }
        await entryRepo.save(entries);
      }

      await eventRepo.save(
        eventRepo.create({
          ticket_id: locked.id,
          from_status: CheckoutTicketStatus.WAITING,
          to_status: CheckoutTicketStatus.CANCELLED,
          actor_user_id: actor.userId,
          device_id: null,
          meta_json: dto.reason?.trim()
            ? JSON.stringify({ reason: dto.reason.trim() })
            : null,
        }),
      );
    });

    const detail = await this.getTicketDetail(ticketId);
    await this.emitLive(detail);
    return detail;
  }

  async listMyTickets(
    userId: number,
    activityId?: number,
  ): Promise<CheckoutTicketDetail[]> {
    const where: { user_id: number; activity_id?: number } = {
      user_id: userId,
    };
    if (activityId != null) where.activity_id = activityId;
    const tickets = await this.ticketRepo.find({
      where,
      order: { id: 'DESC' },
      take: 50,
    });
    return Promise.all(tickets.map((t) => this.getTicketDetail(t.id)));
  }

  async getMyTicket(
    userId: number,
    ticketId: number,
  ): Promise<CheckoutTicketDetail> {
    const ticket = await this.requireTicketById(ticketId);
    if (ticket.user_id !== userId) {
      throw new NotFoundException('ไม่พบคิว');
    }
    return this.getTicketDetail(ticketId);
  }

  /**
   * ปลาทั้งหมดของผู้ใช้ที่เกี่ยวข้องกับการคืนปลา (ใบสมัครที่ชำระเงินแล้ว)
   * ใช้เป็นแหล่งข้อมูลหน้า dashboard คืนปลา — ไม่ต้องไล่ทีละ order
   */
  async listMyCheckoutEntries(
    userId: number,
    activityId?: number,
  ): Promise<MyCheckoutEntriesResult> {
    const rows = await this.entryRepo
      .createQueryBuilder('ent')
      .innerJoin(ActivityRegistration, 'reg', 'reg.id = ent.registration_id')
      .innerJoin(
        Activity,
        'act',
        'act.id = reg.activity_id AND act.deleted_at IS NULL',
      )
      .innerJoin(
        Order,
        'o',
        'o.refer_id = reg.id AND o.type = :otype AND o.status = :paid',
        { otype: OrderType.ACTIVITY_REGISTRATION, paid: OrderStatus.PAID },
      )
      .where('reg.user_id = :userId', { userId })
      .select('ent.id', 'entry_id')
      .addSelect('ent.registration_id', 'registration_id')
      .addSelect('ent.entry_index', 'entry_index')
      .addSelect('ent.entry_code', 'entry_code')
      .addSelect('ent.package_id', 'package_id')
      .addSelect('ent.ready_to_checkout', 'ready_to_checkout')
      .addSelect('ent.checked_out_at', 'checked_out_at')
      .addSelect('ent.checked_out_by_name', 'checked_out_by_name')
      .addSelect('ent.checkout_requested_at', 'checkout_requested_at')
      .addSelect('ent.checkout_remark', 'checkout_remark')
      .addSelect('reg.registration_no', 'registration_no')
      .addSelect('reg.applicant_name', 'applicant_name')
      .addSelect('reg.farm_name', 'farm_name')
      .addSelect('reg.checked_in_at', 'checked_in_at')
      .addSelect('reg.activity_id', 'activity_id')
      .addSelect('act.title', 'activity_title')
      .addSelect('act.slug', 'activity_slug')
      .addSelect('act.start_date', 'activity_start_date')
      .addSelect('act.end_date', 'activity_end_date')
      .orderBy('act.start_date', 'DESC')
      .addOrderBy('ent.registration_id', 'ASC')
      .addOrderBy('ent.id', 'ASC')
      .getRawMany<MyCheckoutEntryRaw>();

    const packageNames = await this.activityPackageService.findLeafNamesByIds([
      ...new Set(rows.map((row) => Number(row.package_id))),
    ]);
    const ticketMap = await this.findActiveTicketsByEntryIds(
      rows.map((row) => Number(row.entry_id)),
    );

    const all: MyCheckoutEntry[] = rows.map((row) => {
      const checkedOutAt = this.rawToIso(row.checked_out_at);
      const checkedInAt = this.rawToIso(row.checked_in_at);
      const readyToCheckout = Boolean(Number(row.ready_to_checkout ?? 0));
      const ticket = ticketMap.get(Number(row.entry_id)) ?? null;

      let blockedReason: string | null = null;
      if (checkedOutAt) {
        blockedReason = 'รับปลาคืนแล้ว';
      } else if (ticket) {
        blockedReason = `อยู่ในคิว ${ticket.queue_code} แล้ว`;
      } else if (!checkedInAt) {
        blockedReason = 'ต้องเช็คอินที่งานก่อนจึงขอคืนปลาได้';
      } else if (!readyToCheckout) {
        blockedReason = 'รอเจ้าหน้าที่มาร์คว่าพร้อมคืน';
      }

      return {
        entry_id: Number(row.entry_id),
        registration_id: Number(row.registration_id),
        registration_no: row.registration_no,
        applicant_name: row.applicant_name,
        farm_name: row.farm_name,
        activity_id: Number(row.activity_id),
        activity_title: row.activity_title,
        entry_index: row.entry_index,
        entry_code: row.entry_code,
        package_name: packageNames.get(Number(row.package_id)) ?? null,
        ready_to_checkout: readyToCheckout,
        checked_in_at: checkedInAt,
        checked_out_at: checkedOutAt,
        checked_out_by_name: row.checked_out_by_name,
        checkout_requested_at: this.rawToIso(row.checkout_requested_at),
        checkout_remark: row.checkout_remark,
        ticket,
        can_request: blockedReason == null,
        blocked_reason: blockedReason,
      };
    });

    const activities: MyCheckoutActivitySummary[] = [];
    const activityIndex = new Map<number, MyCheckoutActivitySummary>();
    for (const row of rows) {
      const id = Number(row.activity_id);
      if (activityIndex.has(id)) continue;
      const summary: MyCheckoutActivitySummary = {
        activity_id: id,
        title: row.activity_title,
        slug: row.activity_slug,
        start_date: this.normalizeQueueDate(row.activity_start_date),
        end_date: this.normalizeQueueDate(row.activity_end_date),
        ...this.emptyCheckoutCounts(),
      };
      activityIndex.set(id, summary);
      activities.push(summary);
    }
    for (const entry of all) {
      const summary = activityIndex.get(entry.activity_id);
      if (summary) this.addToCheckoutCounts(summary, entry);
    }

    const entries =
      activityId != null
        ? all.filter((entry) => entry.activity_id === activityId)
        : all;

    const counts = this.emptyCheckoutCounts();
    for (const entry of entries) this.addToCheckoutCounts(counts, entry);

    return { activities, entries, counts };
  }

  // ─── POS: claim / ready / complete / heartbeat ─────────────────────

  async claimNext(
    dto: ClaimNextCheckoutQueueDto,
  ): Promise<CheckoutTicketDetail | null> {
    const deviceCode = dto.device_code.trim().toUpperCase();
    if (!deviceCode) throw new BadRequestException('device_code is required');

    const result = await this.dataSource.transaction(async (manager) => {
      const deviceRepo = manager.getRepository(CheckoutDevice);
      const ticketRepo = manager.getRepository(CheckoutTicket);
      const eventRepo = manager.getRepository(CheckoutTicketEvent);

      const device = await deviceRepo.findOne({
        where: { device_code: deviceCode },
        lock: { mode: 'pessimistic_write' },
      });
      if (!device || !device.is_active) {
        throw new NotFoundException(`ไม่พบเครื่อง ${deviceCode}`);
      }

      const activityId = device.activity_id ?? dto.activity_id ?? null;
      if (activityId == null) {
        throw new BadRequestException(
          'ระบุ activity_id หรือผูก activity กับเครื่องก่อน',
        );
      }

      if (
        device.current_ticket_id != null &&
        device.status === CheckoutDeviceStatus.ONLINE_BUSY
      ) {
        const current = await ticketRepo.findOne({
          where: { id: device.current_ticket_id },
        });
        if (
          current &&
          (current.status === CheckoutTicketStatus.PREPARING ||
            current.status === CheckoutTicketStatus.READY)
        ) {
          throw new ConflictException(
            `เครื่องนี้กำลังทำคิว ${current.queue_code} อยู่`,
          );
        }
      }

      const waiting = await ticketRepo
        .createQueryBuilder('t')
        .where('t.activity_id = :activityId', { activityId })
        .andWhere('t.status = :status', {
          status: CheckoutTicketStatus.WAITING,
        })
        .orderBy('t.queue_no', 'ASC')
        .setLock('pessimistic_write')
        .take(1)
        .getOne();

      const now = new Date();
      this.touchDeviceHeartbeat(device, now);

      if (!waiting) {
        device.status = CheckoutDeviceStatus.ONLINE_IDLE;
        device.current_ticket_id = null;
        await deviceRepo.save(device);
        return null;
      }

      const staffName = dto.staff_name?.trim() || null;
      const staffUserId = dto.staff_user_id ?? null;

      waiting.status = CheckoutTicketStatus.PREPARING;
      waiting.device_id = device.id;
      waiting.staff_user_id = staffUserId;
      waiting.staff_name = staffName;
      waiting.preparing_at = now;
      await ticketRepo.save(waiting);

      device.status = CheckoutDeviceStatus.ONLINE_BUSY;
      device.current_ticket_id = waiting.id;
      await deviceRepo.save(device);

      await eventRepo.save(
        eventRepo.create({
          ticket_id: waiting.id,
          from_status: CheckoutTicketStatus.WAITING,
          to_status: CheckoutTicketStatus.PREPARING,
          actor_user_id: staffUserId,
          device_id: device.id,
          meta_json: JSON.stringify({ device_code: deviceCode }),
        }),
      );

      return { ticketId: waiting.id, activityId, deviceCode };
    });

    if (!result) return null;

    const detail = await this.getTicketDetail(result.ticketId);
    await this.emitLive(detail);
    return detail;
  }

  async markReady(
    queueCode: string,
    dto: CheckoutQueueTransitionDto,
  ): Promise<CheckoutTicketDetail> {
    const code = queueCode.trim().toUpperCase();
    const ticket = await this.requireTicketByCode(code);

    await this.dataSource.transaction(async (manager) => {
      const ticketRepo = manager.getRepository(CheckoutTicket);
      const deviceRepo = manager.getRepository(CheckoutDevice);
      const eventRepo = manager.getRepository(CheckoutTicketEvent);
      const itemRepo = manager.getRepository(CheckoutTicketItem);
      const entryRepo = manager.getRepository(ActivityRegistrationEntry);

      const locked = await ticketRepo.findOne({
        where: { id: ticket.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throw new NotFoundException('ไม่พบคิว');
      if (locked.status !== CheckoutTicketStatus.PREPARING) {
        throw new BadRequestException(
          `เปลี่ยนเป็น ready ได้จาก preparing เท่านั้น (ตอนนี้: ${locked.status})`,
        );
      }

      if (dto.device_code) {
        const device = await deviceRepo.findOne({
          where: { device_code: dto.device_code.trim().toUpperCase() },
        });
        if (!device || locked.device_id !== device.id) {
          throw new BadRequestException('คิวนี้ไม่ได้ผูกกับเครื่องนี้');
        }
      }

      const now = new Date();
      locked.status = CheckoutTicketStatus.READY;
      locked.ready_at = now;
      if (dto.staff_name?.trim()) locked.staff_name = dto.staff_name.trim();
      if (dto.staff_user_id != null) locked.staff_user_id = dto.staff_user_id;
      await ticketRepo.save(locked);

      const items = await itemRepo.find({ where: { ticket_id: locked.id } });
      if (items.length) {
        const entries = await entryRepo.find({
          where: { id: In(items.map((i) => i.entry_id)) },
        });
        for (const entry of entries) {
          entry.ready_to_checkout = true;
        }
        await entryRepo.save(entries);
      }

      await eventRepo.save(
        eventRepo.create({
          ticket_id: locked.id,
          from_status: CheckoutTicketStatus.PREPARING,
          to_status: CheckoutTicketStatus.READY,
          actor_user_id: dto.staff_user_id ?? locked.staff_user_id,
          device_id: locked.device_id,
          meta_json: null,
        }),
      );
    });

    const detail = await this.getTicketDetail(ticket.id);
    await this.emitLive(detail);
    return detail;
  }

  async complete(
    queueCode: string,
    dto: CheckoutQueueTransitionDto,
  ): Promise<CheckoutTicketDetail> {
    const code = queueCode.trim().toUpperCase();
    const ticket = await this.requireTicketByCode(code);

    await this.dataSource.transaction(async (manager) => {
      const ticketRepo = manager.getRepository(CheckoutTicket);
      const deviceRepo = manager.getRepository(CheckoutDevice);
      const eventRepo = manager.getRepository(CheckoutTicketEvent);
      const itemRepo = manager.getRepository(CheckoutTicketItem);
      const entryRepo = manager.getRepository(ActivityRegistrationEntry);

      const locked = await ticketRepo.findOne({
        where: { id: ticket.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throw new NotFoundException('ไม่พบคิว');
      if (
        locked.status !== CheckoutTicketStatus.READY &&
        locked.status !== CheckoutTicketStatus.PREPARING
      ) {
        throw new BadRequestException(
          `complete ได้จาก ready/preparing เท่านั้น (ตอนนี้: ${locked.status})`,
        );
      }

      let device: CheckoutDevice | null = null;
      if (dto.device_code) {
        device = await deviceRepo.findOne({
          where: { device_code: dto.device_code.trim().toUpperCase() },
          lock: { mode: 'pessimistic_write' },
        });
        if (!device || locked.device_id !== device.id) {
          throw new BadRequestException('คิวนี้ไม่ได้ผูกกับเครื่องนี้');
        }
      } else if (locked.device_id != null) {
        device = await deviceRepo.findOne({
          where: { id: locked.device_id },
          lock: { mode: 'pessimistic_write' },
        });
      }

      const now = new Date();
      const fromStatus = locked.status;
      const staffName =
        dto.staff_name?.trim() || locked.staff_name || device?.name || null;
      const staffUserId = dto.staff_user_id ?? locked.staff_user_id;

      locked.status = CheckoutTicketStatus.COMPLETE;
      locked.completed_at = now;
      locked.staff_name = staffName;
      locked.staff_user_id = staffUserId;
      await ticketRepo.save(locked);

      const items = await itemRepo.find({ where: { ticket_id: locked.id } });
      if (items.length) {
        const entries = await entryRepo.find({
          where: { id: In(items.map((i) => i.entry_id)) },
        });
        for (const entry of entries) {
          entry.checked_out_at = now;
          entry.checked_out_by_user_id = staffUserId;
          entry.checked_out_by_name = staffName;
          entry.ready_to_checkout = false;
        }
        await entryRepo.save(entries);
      }

      if (device) {
        device.status = CheckoutDeviceStatus.ONLINE_IDLE;
        device.current_ticket_id = null;
        this.touchDeviceHeartbeat(device, now);
        await deviceRepo.save(device);
      }

      await eventRepo.save(
        eventRepo.create({
          ticket_id: locked.id,
          from_status: fromStatus,
          to_status: CheckoutTicketStatus.COMPLETE,
          actor_user_id: staffUserId,
          device_id: locked.device_id,
          meta_json: null,
        }),
      );
    });

    const detail = await this.getTicketDetail(ticket.id);
    await this.emitLive(detail);
    return detail;
  }

  /**
   * Admin ปิดคิวแทนพนักงาน (force complete) — ใช้กรณีเครื่องค้าง/พนักงานกดไม่ทัน
   * ปิดได้จากทุกสถานะที่ยังเดินอยู่ (waiting/preparing/ready) และมาร์คปลาในใบว่า
   * checkout แล้วทันทีในทรานแซกชันเดียวกัน
   */
  async adminCompleteTicket(
    ticketId: number,
    actor: { userId: number; name: string | null },
    dto: AdminCompleteCheckoutTicketDto = {},
  ): Promise<CheckoutTicketDetail> {
    const ticket = await this.requireTicketById(ticketId);
    const remark = dto.remark?.trim() || null;

    await this.dataSource.transaction(async (manager) => {
      const ticketRepo = manager.getRepository(CheckoutTicket);
      const deviceRepo = manager.getRepository(CheckoutDevice);
      const eventRepo = manager.getRepository(CheckoutTicketEvent);
      const itemRepo = manager.getRepository(CheckoutTicketItem);
      const entryRepo = manager.getRepository(ActivityRegistrationEntry);

      const locked = await ticketRepo.findOne({
        where: { id: ticket.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throw new NotFoundException('ไม่พบคิว');
      if (locked.status === CheckoutTicketStatus.COMPLETE) {
        throw new BadRequestException('คิวนี้ปิดแล้ว');
      }
      if (locked.status === CheckoutTicketStatus.CANCELLED) {
        throw new BadRequestException('คิวนี้ถูกยกเลิกแล้ว ปิดคิวไม่ได้');
      }

      const now = new Date();
      const fromStatus = locked.status;
      const staffName = locked.staff_name || actor.name;
      const staffUserId = locked.staff_user_id ?? actor.userId;

      locked.status = CheckoutTicketStatus.COMPLETE;
      locked.completed_at = now;
      locked.staff_name = staffName;
      locked.staff_user_id = staffUserId;
      await ticketRepo.save(locked);

      const items = await itemRepo.find({ where: { ticket_id: locked.id } });
      if (items.length) {
        const entries = await entryRepo.find({
          where: { id: In(items.map((i) => i.entry_id)) },
        });
        for (const entry of entries) {
          entry.checked_out_at = now;
          entry.checked_out_by_user_id = actor.userId;
          entry.checked_out_by_name = actor.name;
          entry.ready_to_checkout = false;
          if (remark) entry.checkout_remark = remark;
        }
        await entryRepo.save(entries);
      }

      if (locked.device_id != null) {
        const device = await deviceRepo.findOne({
          where: { id: locked.device_id },
          lock: { mode: 'pessimistic_write' },
        });
        // ปล่อยเครื่องให้ว่าง เฉพาะกรณีที่ยังถือใบนี้อยู่
        if (device && device.current_ticket_id === locked.id) {
          device.status = CheckoutDeviceStatus.ONLINE_IDLE;
          device.current_ticket_id = null;
          await deviceRepo.save(device);
        }
      }

      await eventRepo.save(
        eventRepo.create({
          ticket_id: locked.id,
          from_status: fromStatus,
          to_status: CheckoutTicketStatus.COMPLETE,
          actor_user_id: actor.userId,
          device_id: locked.device_id,
          meta_json: JSON.stringify({
            source: 'admin_force_complete',
            from_status: fromStatus,
            remark,
          }),
        }),
      );
    });

    const detail = await this.getTicketDetail(ticket.id);
    await this.emitLive(detail);
    return detail;
  }

  async heartbeat(
    deviceCode: string,
    activityId?: number,
  ): Promise<{
    device: CheckoutDevice;
    current_ticket: CheckoutTicketDetail | null;
    board: {
      total: number;
      waiting: number;
      preparing: number;
      ready: number;
      complete: number;
    } | null;
    next_waiting: { queue_code: string; queue_no: number; applicant_name: string | null } | null;
  }> {
    const code = deviceCode.trim().toUpperCase();
    const device = await this.deviceRepo.findOne({
      where: { device_code: code },
    });
    if (!device || !device.is_active) {
      throw new NotFoundException(`ไม่พบเครื่อง ${code}`);
    }

    const now = new Date();
    this.touchDeviceHeartbeat(device, now);
    if (device.status === CheckoutDeviceStatus.OFFLINE) {
      device.status =
        device.current_ticket_id != null
          ? CheckoutDeviceStatus.ONLINE_BUSY
          : CheckoutDeviceStatus.ONLINE_IDLE;
    }
    await this.deviceRepo.save(device);

    let current: CheckoutTicketDetail | null = null;
    if (device.current_ticket_id != null) {
      try {
        current = await this.getTicketDetail(device.current_ticket_id);
      } catch (err) {
        this.logger.warn(
          `heartbeat getTicketDetail(${device.current_ticket_id}) failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        // ยังถือคิวอยู่ — ส่งข้อมูลขั้นต่ำจากแถว ticket กัน client คิดว่าถูก reclaim
        const row = await this.ticketRepo.findOne({
          where: { id: device.current_ticket_id },
        });
        if (
          row &&
          (row.status === CheckoutTicketStatus.PREPARING ||
            row.status === CheckoutTicketStatus.READY)
        ) {
          current = {
            id: row.id,
            activity_id: row.activity_id,
            user_id: row.user_id,
            queue_no: row.queue_no,
            queue_date: this.normalizeQueueDate(row.queue_date),
            queue_code: row.queue_code,
            status: row.status,
            device_id: row.device_id,
            device_code: device.device_code,
            staff_user_id: row.staff_user_id,
            staff_name: row.staff_name,
            note: row.note,
            cancel_reason: row.cancel_reason,
            requested_at: row.requested_at.toISOString(),
            preparing_at: row.preparing_at?.toISOString() ?? null,
            ready_at: row.ready_at?.toISOString() ?? null,
            completed_at: row.completed_at?.toISOString() ?? null,
            cancelled_at: row.cancelled_at?.toISOString() ?? null,
            applicant_name: null,
            position: null,
            items: [],
          };
        }
      }
    }

    const resolvedActivityId =
      device.activity_id ?? activityId ?? current?.activity_id ?? null;

    let board: {
      total: number;
      waiting: number;
      preparing: number;
      ready: number;
      complete: number;
    } | null = null;
    let nextWaiting: {
      queue_code: string;
      queue_no: number;
      applicant_name: string | null;
    } | null = null;

    if (resolvedActivityId != null) {
      const payload = await this.getBoard(resolvedActivityId);
      board = {
        total:
          payload.counts.waiting +
          payload.counts.preparing +
          payload.counts.ready +
          payload.counts.complete,
        waiting: payload.counts.waiting,
        preparing: payload.counts.preparing,
        ready: payload.counts.ready,
        complete: payload.counts.complete,
      };
      nextWaiting = await this.peekNextWaiting(resolvedActivityId);
    }

    return {
      device,
      current_ticket: current,
      board,
      next_waiting: nextWaiting,
    };
  }

  /** Peek oldest waiting ticket without locking (for POS UI preview). */
  async peekNextWaiting(activityId: number): Promise<{
    queue_code: string;
    queue_no: number;
    applicant_name: string | null;
  } | null> {
    const waiting = await this.ticketRepo.findOne({
      where: {
        activity_id: activityId,
        status: CheckoutTicketStatus.WAITING,
      },
      order: { queue_no: 'ASC' },
    });
    if (!waiting) return null;

    const firstItem = await this.itemRepo.findOne({
      where: { ticket_id: waiting.id },
      order: { id: 'ASC' },
    });
    let applicantName: string | null = null;
    if (firstItem) {
      const reg = await this.registrationRepo.findOne({
        where: { id: firstItem.registration_id },
      });
      applicantName = reg?.applicant_name ?? null;
    }

    return {
      queue_code: waiting.queue_code,
      queue_no: waiting.queue_no,
      applicant_name: applicantName,
    };
  }

  async getCurrentForDevice(
    deviceCode: string,
  ): Promise<CheckoutTicketDetail | null> {
    const code = deviceCode.trim().toUpperCase();
    const device = await this.deviceRepo.findOne({
      where: { device_code: code },
    });
    if (!device?.current_ticket_id) return null;
    return this.getTicketDetail(device.current_ticket_id);
  }

  // ─── Board (head dashboard) ────────────────────────────────────────

  async getBoard(activityId: number): Promise<CheckoutBoardPayload> {
    await this.requireActivity(activityId);

    const countsRaw = await this.ticketRepo
      .createQueryBuilder('t')
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'cnt')
      .where('t.activity_id = :activityId', { activityId })
      .andWhere('t.queue_date = :queueDate', {
        queueDate: this.toQueueDate(new Date()),
      })
      .groupBy('t.status')
      .getRawMany<{ status: CheckoutTicketStatus; cnt: string }>();

    const counts = {
      waiting: 0,
      preparing: 0,
      ready: 0,
      complete: 0,
      cancelled: 0,
    };
    for (const row of countsRaw) {
      const n = Number(row.cnt) || 0;
      if (row.status === CheckoutTicketStatus.WAITING) counts.waiting = n;
      if (row.status === CheckoutTicketStatus.PREPARING) counts.preparing = n;
      if (row.status === CheckoutTicketStatus.READY) counts.ready = n;
      if (row.status === CheckoutTicketStatus.COMPLETE) counts.complete = n;
      if (row.status === CheckoutTicketStatus.CANCELLED) counts.cancelled = n;
    }

    const devices = await this.deviceRepo.find({
      where: [{ activity_id: activityId }, { activity_id: IsNull() }],
      order: { device_code: 'ASC' },
    });

    const ticketIds = devices
      .map((d) => d.current_ticket_id)
      .filter((id): id is number => id != null);
    const ticketMap = new Map<number, CheckoutTicket>();
    if (ticketIds.length) {
      const tickets = await this.ticketRepo.find({
        where: { id: In(ticketIds) },
      });
      for (const t of tickets) ticketMap.set(t.id, t);
    }
    const itemCounts = await this.countItemsByTicketIds(ticketIds);

    return {
      activity_id: activityId,
      counts,
      devices: devices.map((d) => {
        const t =
          d.current_ticket_id != null
            ? ticketMap.get(d.current_ticket_id)
            : null;
        return {
          id: d.id,
          code: d.device_code,
          name: d.name,
          status: d.status,
          is_active: d.is_active,
          queue_code: t?.queue_code ?? null,
          ticket_id: t?.id ?? null,
          ticket_status: t?.status ?? null,
          staff_name: t?.staff_name ?? null,
          items_count: t ? (itemCounts.get(t.id) ?? 0) : 0,
          started_at: t?.preparing_at?.toISOString() ?? null,
          last_heartbeat_ms: this.deviceHeartbeatMs(d),
        };
      }),
    };
  }

  /**
   * รายการคิวของกิจกรรม (ฝั่งแอดมิน) — ใช้กับหน้า dashboard คิวเรียลไทม์
   * ค่า default คือคิวของ "วันนี้" เพราะ queue_no รีเซ็ตรายวัน
   */
  async listTicketsForAdmin(
    activityId: number,
    options: {
      status?: CheckoutTicketStatus;
      deviceCode?: string;
      queueDate?: string;
      search?: string;
      limit?: number;
    } = {},
  ): Promise<{
    activity: { id: number; title: string };
    queue_date: string;
    items: AdminCheckoutTicketRow[];
    total: number;
  }> {
    const activityRow = await this.requireActivity(activityId);
    const activity = { id: activityRow.id, title: activityRow.title };

    const queueDate = options.queueDate?.trim() || this.toQueueDate(new Date());
    const take = Math.min(Math.max(options.limit ?? 300, 1), 1000);

    const where: {
      activity_id: number;
      queue_date: string;
      status?: CheckoutTicketStatus;
      device_id?: number;
    } = { activity_id: activityId, queue_date: queueDate };
    if (options.status) where.status = options.status;

    if (options.deviceCode?.trim()) {
      const device = await this.deviceRepo.findOne({
        where: { device_code: options.deviceCode.trim().toUpperCase() },
      });
      if (!device) {
        return { activity, queue_date: queueDate, items: [], total: 0 };
      }
      where.device_id = device.id;
    }

    const tickets = await this.ticketRepo.find({
      where,
      order: { queue_no: 'ASC' },
      take,
    });
    if (!tickets.length) {
      return { activity, queue_date: queueDate, items: [], total: 0 };
    }

    const items = await this.itemRepo.find({
      where: { ticket_id: In(tickets.map((t) => t.id)) },
      order: { id: 'ASC' },
    });
    const itemsByTicket = new Map<number, CheckoutTicketItem[]>();
    for (const item of items) {
      const list = itemsByTicket.get(item.ticket_id);
      if (list) list.push(item);
      else itemsByTicket.set(item.ticket_id, [item]);
    }

    const registrationIds = [
      ...new Set(items.map((i) => i.registration_id).filter((id) => id > 0)),
    ];
    const registrations = registrationIds.length
      ? await this.registrationRepo.find({ where: { id: In(registrationIds) } })
      : [];
    const regMap = new Map(registrations.map((r) => [r.id, r]));

    const deviceIds = [
      ...new Set(
        tickets
          .map((t) => t.device_id)
          .filter((id): id is number => id != null),
      ),
    ];
    const devices = deviceIds.length
      ? await this.deviceRepo.find({ where: { id: In(deviceIds) } })
      : [];
    const deviceMap = new Map(devices.map((d) => [d.id, d]));

    let waitingPosition = 0;
    const rows: AdminCheckoutTicketRow[] = tickets.map((ticket) => {
      const ticketItems = itemsByTicket.get(ticket.id) ?? [];
      const firstReg = ticketItems.length
        ? regMap.get(ticketItems[0]!.registration_id)
        : undefined;
      if (ticket.status === CheckoutTicketStatus.WAITING) waitingPosition += 1;

      return {
        id: ticket.id,
        queue_no: ticket.queue_no,
        queue_code: ticket.queue_code,
        queue_date: this.normalizeQueueDate(ticket.queue_date),
        status: ticket.status,
        user_id: ticket.user_id,
        applicant_name: firstReg?.applicant_name ?? null,
        registration_no: firstReg?.registration_no ?? null,
        farm_name: firstReg?.farm_name ?? null,
        items_count: ticketItems.length,
        item_codes: ticketItems.map(
          (i) => i.entry_code || `#${i.entry_id}`,
        ),
        device_id: ticket.device_id,
        device_code:
          ticket.device_id != null
            ? (deviceMap.get(ticket.device_id)?.device_code ?? null)
            : null,
        staff_name: ticket.staff_name,
        note: ticket.note,
        cancel_reason: ticket.cancel_reason,
        requested_at: ticket.requested_at.toISOString(),
        preparing_at: ticket.preparing_at?.toISOString() ?? null,
        ready_at: ticket.ready_at?.toISOString() ?? null,
        completed_at: ticket.completed_at?.toISOString() ?? null,
        cancelled_at: ticket.cancelled_at?.toISOString() ?? null,
        position:
          ticket.status === CheckoutTicketStatus.WAITING
            ? waitingPosition
            : null,
      };
    });

    const keyword = options.search?.trim().toLowerCase();
    const filtered = keyword
      ? rows.filter((row) =>
          [
            row.queue_code,
            row.applicant_name,
            row.registration_no,
            row.farm_name,
            row.device_code,
            row.staff_name,
            ...row.item_codes,
          ].some((value) => (value ?? '').toLowerCase().includes(keyword)),
        )
      : rows;

    return {
      activity,
      queue_date: queueDate,
      items: filtered,
      total: filtered.length,
    };
  }

  private async countItemsByTicketIds(
    ticketIds: number[],
  ): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    const ids = [...new Set(ticketIds.filter((id) => id > 0))];
    if (!ids.length) return map;

    const rows = await this.itemRepo
      .createQueryBuilder('item')
      .select('item.ticket_id', 'ticket_id')
      .addSelect('COUNT(*)', 'cnt')
      .where('item.ticket_id IN (:...ids)', { ids })
      .groupBy('item.ticket_id')
      .getRawMany<{ ticket_id: number; cnt: string }>();

    for (const row of rows) {
      map.set(Number(row.ticket_id), Number(row.cnt) || 0);
    }
    return map;
  }

  async getTicketDetail(ticketId: number): Promise<CheckoutTicketDetail> {
    const ticket = await this.requireTicketById(ticketId);
    const items = await this.itemRepo.find({
      where: { ticket_id: ticket.id },
      order: { id: 'ASC' },
    });

    const registrationIds = [
      ...new Set(items.map((i) => i.registration_id).filter((id) => id > 0)),
    ];
    const registrations = registrationIds.length
      ? await this.registrationRepo.find({
          where: { id: In(registrationIds) },
        })
      : [];
    const regMap = new Map(registrations.map((r) => [r.id, r]));

    let deviceCode: string | null = null;
    if (ticket.device_id != null) {
      const device = await this.deviceRepo.findOne({
        where: { id: ticket.device_id },
      });
      deviceCode = device?.device_code ?? null;
    }

    let position: number | null = null;
    if (ticket.status === CheckoutTicketStatus.WAITING) {
      position = await this.ticketRepo
        .createQueryBuilder('t')
        .where('t.activity_id = :activityId', {
          activityId: ticket.activity_id,
        })
        .andWhere('t.status = :status', {
          status: CheckoutTicketStatus.WAITING,
        })
        .andWhere('t.queue_no <= :queueNo', { queueNo: ticket.queue_no })
        .getCount();
    }

    const detailItems = items.map((i) => {
      const reg = regMap.get(i.registration_id);
      return {
        id: i.id,
        registration_id: i.registration_id,
        registration_no: reg?.registration_no ?? null,
        applicant_name: reg?.applicant_name ?? null,
        entry_id: i.entry_id,
        entry_code: i.entry_code,
        package_name: i.package_name,
      };
    });

    return {
      id: ticket.id,
      activity_id: ticket.activity_id,
      user_id: ticket.user_id,
      queue_no: ticket.queue_no,
      queue_date: this.normalizeQueueDate(ticket.queue_date),
      queue_code: ticket.queue_code,
      status: ticket.status,
      device_id: ticket.device_id,
      device_code: deviceCode,
      staff_user_id: ticket.staff_user_id,
      staff_name: ticket.staff_name,
      note: ticket.note,
      cancel_reason: ticket.cancel_reason,
      requested_at: ticket.requested_at.toISOString(),
      preparing_at: ticket.preparing_at?.toISOString() ?? null,
      ready_at: ticket.ready_at?.toISOString() ?? null,
      completed_at: ticket.completed_at?.toISOString() ?? null,
      cancelled_at: ticket.cancelled_at?.toISOString() ?? null,
      applicant_name: detailItems[0]?.applicant_name ?? null,
      position,
      items: detailItems,
    };
  }

  // ─── Reclaim stale devices ─────────────────────────────────────────

  async reclaimStaleDevices(): Promise<number> {
    const nowMs = Date.now();
    const offlineBeforeMs = nowMs - DEVICE_OFFLINE_MS;
    const reclaimBeforeMs = nowMs - TICKET_RECLAIM_PREPARING_MS;

    // Use epoch ms column — datetime TZ skew was reclaiming tickets within seconds
    const candidates = await this.deviceRepo
      .createQueryBuilder('d')
      .where('d.is_active = true')
      .andWhere('d.status != :offline', {
        offline: CheckoutDeviceStatus.OFFLINE,
      })
      .andWhere('d.last_heartbeat_ms IS NOT NULL')
      .andWhere('CAST(d.last_heartbeat_ms AS UNSIGNED) < :offlineBeforeMs', {
        offlineBeforeMs,
      })
      .getMany();

    let reclaimed = 0;
    for (const device of candidates) {
      const activityIds = await this.dataSource.transaction(async (manager) => {
        const deviceRepo = manager.getRepository(CheckoutDevice);
        const ticketRepo = manager.getRepository(CheckoutTicket);
        const eventRepo = manager.getRepository(CheckoutTicketEvent);
        const itemRepo = manager.getRepository(CheckoutTicketItem);
        const entryRepo = manager.getRepository(ActivityRegistrationEntry);

        const locked = await deviceRepo.findOne({
          where: { id: device.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!locked) return [] as number[];

        const hbMs = this.deviceHeartbeatMs(locked);
        if (hbMs == null || hbMs >= offlineBeforeMs) {
          return [] as number[];
        }

        const affectedActivityIds: number[] = [];
        const canReclaimTicket = hbMs < reclaimBeforeMs;
        let clearedTicket = false;

        if (locked.current_ticket_id != null && canReclaimTicket) {
          const ticket = await ticketRepo.findOne({
            where: { id: locked.current_ticket_id },
            lock: { mode: 'pessimistic_write' },
          });
          if (ticket && ticket.status === CheckoutTicketStatus.PREPARING) {
            ticket.status = CheckoutTicketStatus.WAITING;
            ticket.device_id = null;
            ticket.staff_user_id = null;
            ticket.staff_name = null;
            ticket.preparing_at = null;
            await ticketRepo.save(ticket);

            const items = await itemRepo.find({
              where: { ticket_id: ticket.id },
            });
            if (items.length) {
              const entries = await entryRepo.find({
                where: { id: In(items.map((i) => i.entry_id)) },
              });
              for (const entry of entries) {
                entry.ready_to_checkout = false;
              }
              await entryRepo.save(entries);
            }

            await eventRepo.save(
              eventRepo.create({
                ticket_id: ticket.id,
                from_status: CheckoutTicketStatus.PREPARING,
                to_status: CheckoutTicketStatus.WAITING,
                actor_user_id: null,
                device_id: locked.id,
                meta_json: JSON.stringify({
                  reason: 'heartbeat_timeout',
                  timeout_ms: TICKET_RECLAIM_PREPARING_MS,
                  last_heartbeat_ms: hbMs,
                }),
              }),
            );
            affectedActivityIds.push(ticket.activity_id);
            reclaimed += 1;
            locked.current_ticket_id = null;
            clearedTicket = true;
          }
        }

        locked.status = CheckoutDeviceStatus.OFFLINE;
        if (clearedTicket) {
          locked.current_ticket_id = null;
        }
        await deviceRepo.save(locked);
        return affectedActivityIds;
      });

      for (const activityId of activityIds) {
        const board = await this.getBoard(activityId);
        this.gateway.emitBoardUpdated(activityId, board);
      }
    }
    return reclaimed;
  }

  /** Timezone-safe heartbeat stamp (epoch ms + legacy datetime). */
  private touchDeviceHeartbeat(device: CheckoutDevice, at = new Date()): void {
    device.last_heartbeat_ms = String(at.getTime());
    device.last_heartbeat_at = at;
  }

  private deviceHeartbeatMs(device: CheckoutDevice): number | null {
    // Only trust epoch ms — last_heartbeat_at datetime is TZ-skewed vs MySQL NOW()
    // (observed ~7h on api-dev) and must not drive reclaim.
    if (device.last_heartbeat_ms == null || String(device.last_heartbeat_ms).length === 0) {
      return null;
    }
    const n = Number(device.last_heartbeat_ms);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  private async emitLive(detail: CheckoutTicketDetail): Promise<void> {
    this.gateway.emitTicketUpdated({
      ticket_id: detail.id,
      queue_code: detail.queue_code,
      status: detail.status,
      activity_id: detail.activity_id,
      user_id: detail.user_id,
      position: detail.position,
    });
    try {
      const board = await this.getBoard(detail.activity_id);
      this.gateway.emitBoardUpdated(detail.activity_id, board);
    } catch (err) {
      this.logger.warn(
        `emit board failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async nextQueueNoInTx(
    ticketRepo: Repository<CheckoutTicket>,
    activityId: number,
    queueDate: string,
  ): Promise<number> {
    const row = await ticketRepo
      .createQueryBuilder('t')
      .select('MAX(t.queue_no)', 'max')
      .where('t.activity_id = :activityId', { activityId })
      .andWhere('t.queue_date = :queueDate', { queueDate })
      .getRawOne<{ max: string | null }>();
    const max = row?.max != null ? Number(row.max) : 0;
    return (Number.isFinite(max) ? max : 0) + 1;
  }

  private formatQueueCode(queueNo: number): string {
    return `${QUEUE_CODE_PREFIX}${String(queueNo).padStart(3, '0')}`;
  }

  private toQueueDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private normalizeQueueDate(value: string | Date): string {
    if (value instanceof Date) return this.toQueueDate(value);
    const s = String(value);
    return s.length >= 10 ? s.slice(0, 10) : s;
  }

  private rawToIso(value: Date | string | null | undefined): string | null {
    if (value == null) return null;
    if (value instanceof Date) return value.toISOString();
    const s = String(value).trim();
    if (!s) return null;
    const parsed = new Date(s);
    return Number.isNaN(parsed.getTime()) ? s : parsed.toISOString();
  }

  /** คิว active (waiting/preparing/ready) ต่อ entry — 1 entry อยู่ได้ใบเดียว */
  private async findActiveTicketsByEntryIds(
    entryIds: number[],
  ): Promise<Map<number, MyCheckoutEntryTicket>> {
    const map = new Map<number, MyCheckoutEntryTicket>();
    const ids = [...new Set(entryIds.filter((id) => id > 0))];
    if (!ids.length) return map;

    const rows = await this.itemRepo
      .createQueryBuilder('item')
      .innerJoin(CheckoutTicket, 't', 't.id = item.ticket_id')
      .where('item.entry_id IN (:...ids)', { ids })
      .andWhere('t.status IN (:...statuses)', {
        statuses: [...ACTIVE_TICKET_STATUSES],
      })
      .select('item.entry_id', 'entry_id')
      .addSelect('t.id', 'ticket_id')
      .addSelect('t.queue_code', 'queue_code')
      .addSelect('t.status', 'status')
      .getRawMany<{
        entry_id: number;
        ticket_id: number;
        queue_code: string;
        status: CheckoutTicketStatus;
      }>();

    for (const row of rows) {
      map.set(Number(row.entry_id), {
        id: Number(row.ticket_id),
        queue_code: row.queue_code,
        status: row.status,
      });
    }
    return map;
  }

  private emptyCheckoutCounts(): MyCheckoutCounts {
    return {
      total: 0,
      requestable: 0,
      in_queue: 0,
      ready: 0,
      checked_out: 0,
    };
  }

  private addToCheckoutCounts(
    counts: MyCheckoutCounts,
    entry: MyCheckoutEntry,
  ): void {
    counts.total += 1;
    if (entry.can_request) counts.requestable += 1;
    if (entry.ticket) counts.in_queue += 1;
    if (entry.ready_to_checkout && !entry.checked_out_at) counts.ready += 1;
    if (entry.checked_out_at) counts.checked_out += 1;
  }

  private generateApiKey(): string {
    return `pos_${randomBytes(24).toString('hex')}`;
  }

  private async assertApiKeyUnique(
    apiKey: string,
    ignoreDeviceId?: number,
  ): Promise<void> {
    const existing = await this.deviceRepo.findOne({
      where: { api_key: apiKey },
    });
    if (existing && existing.id !== ignoreDeviceId) {
      throw new ConflictException('API key นี้ถูกใช้กับเครื่องอื่นแล้ว');
    }
  }

  private async requireActivity(id: number): Promise<Activity> {
    const activity = await this.activityRepo.findOne({ where: { id } });
    if (!activity) throw new NotFoundException('ไม่พบกิจกรรม');
    return activity;
  }

  private async requireDeviceById(id: number): Promise<CheckoutDevice> {
    const device = await this.deviceRepo.findOne({ where: { id } });
    if (!device) throw new NotFoundException('ไม่พบเครื่อง');
    return device;
  }

  private async requireTicketById(id: number): Promise<CheckoutTicket> {
    const ticket = await this.ticketRepo.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException('ไม่พบคิว');
    return ticket;
  }

  private async requireTicketByCode(queueCode: string): Promise<CheckoutTicket> {
    const today = this.toQueueDate(new Date());
    const todayTicket = await this.ticketRepo.findOne({
      where: { queue_code: queueCode, queue_date: today },
      order: { id: 'DESC' },
    });
    if (todayTicket) return todayTicket;

    const ticket = await this.ticketRepo.findOne({
      where: { queue_code: queueCode },
      order: { id: 'DESC' },
    });
    if (!ticket) throw new NotFoundException(`ไม่พบคิว ${queueCode}`);
    return ticket;
  }
}
