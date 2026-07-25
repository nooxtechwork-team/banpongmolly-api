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
import { PrintJobType } from '../entities/print-job.entity';
import { ActivityPackageService } from '../activity-package/activity-package.service';
import { PrintJobService } from '../print-job/print-job.service';
import {
  CheckoutQueueGateway,
  type CheckoutBoardPayload,
} from './checkout-queue.gateway';
import type {
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

const HEARTBEAT_OFFLINE_MS = 30_000;
const RECLAIM_INTERVAL_MS = 10_000;
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
  print_job_id?: number | null;
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
    private readonly printJobService: PrintJobService,
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
      device.last_heartbeat_at = now;

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

    let printJobId: number | null = null;
    if (dto.print) {
      try {
        const detail = await this.getTicketDetail(result.ticketId);
        const job = await this.printJobService.createQueueTicket({
          job_type: PrintJobType.FISH_RETURN,
          label: `${detail.queue_code} · ${detail.applicant_name || ''}`.trim(),
          target_device_id: result.deviceCode,
        });
        printJobId = job.id;
      } catch (err) {
        this.logger.warn(
          `FISH_RETURN print failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const detail = await this.getTicketDetail(result.ticketId);
    if (printJobId != null) detail.print_job_id = printJobId;
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

    if (dto.print) {
      try {
        const detail = await this.getTicketDetail(ticket.id);
        await this.printJobService.createQueueTicket({
          job_type: PrintJobType.FISH_RETURN,
          label: `${detail.queue_code} · ${detail.applicant_name || ''}`.trim(),
          target_device_id: dto.device_code?.trim().toUpperCase(),
        });
      } catch (err) {
        this.logger.warn(
          `FISH_RETURN print on ready failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

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
        device.last_heartbeat_at = now;
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

  async heartbeat(
    deviceCode: string,
    activityId?: number,
  ): Promise<{
    device: CheckoutDevice;
    current_ticket: CheckoutTicketDetail | null;
  }> {
    const code = deviceCode.trim().toUpperCase();
    const device = await this.deviceRepo.findOne({
      where: { device_code: code },
    });
    if (!device || !device.is_active) {
      throw new NotFoundException(`ไม่พบเครื่อง ${code}`);
    }

    const now = new Date();
    device.last_heartbeat_at = now;
    if (device.status === CheckoutDeviceStatus.OFFLINE) {
      device.status =
        device.current_ticket_id != null
          ? CheckoutDeviceStatus.ONLINE_BUSY
          : CheckoutDeviceStatus.ONLINE_IDLE;
    }
    if (activityId != null && device.activity_id == null) {
      // transient binding not persisted — activity only needed for claim
    }
    await this.deviceRepo.save(device);

    let current: CheckoutTicketDetail | null = null;
    if (device.current_ticket_id != null) {
      try {
        current = await this.getTicketDetail(device.current_ticket_id);
      } catch {
        current = null;
      }
    }
    return { device, current_ticket: current };
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
    };
    for (const row of countsRaw) {
      const n = Number(row.cnt) || 0;
      if (row.status === CheckoutTicketStatus.WAITING) counts.waiting = n;
      if (row.status === CheckoutTicketStatus.PREPARING) counts.preparing = n;
      if (row.status === CheckoutTicketStatus.READY) counts.ready = n;
      if (row.status === CheckoutTicketStatus.COMPLETE) counts.complete = n;
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

    return {
      activity_id: activityId,
      counts,
      devices: devices.map((d) => {
        const t =
          d.current_ticket_id != null
            ? ticketMap.get(d.current_ticket_id)
            : null;
        return {
          code: d.device_code,
          name: d.name,
          status: d.status,
          queue_code: t?.queue_code ?? null,
        };
      }),
    };
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
    const cutoff = new Date(Date.now() - HEARTBEAT_OFFLINE_MS);
    const stale = await this.deviceRepo
      .createQueryBuilder('d')
      .where('d.is_active = true')
      .andWhere('d.status != :offline', {
        offline: CheckoutDeviceStatus.OFFLINE,
      })
      .andWhere(
        '(d.last_heartbeat_at IS NULL OR d.last_heartbeat_at < :cutoff)',
        { cutoff },
      )
      .getMany();

    let reclaimed = 0;
    for (const device of stale) {
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
        if (
          locked.last_heartbeat_at &&
          locked.last_heartbeat_at >= cutoff
        ) {
          return [] as number[];
        }

        const affectedActivityIds: number[] = [];
        if (locked.current_ticket_id != null) {
          const ticket = await ticketRepo.findOne({
            where: { id: locked.current_ticket_id },
            lock: { mode: 'pessimistic_write' },
          });
          if (
            ticket &&
            ticket.status === CheckoutTicketStatus.PREPARING
          ) {
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
                meta_json: JSON.stringify({ reason: 'heartbeat_timeout' }),
              }),
            );
            affectedActivityIds.push(ticket.activity_id);
            reclaimed += 1;
          }
        }

        locked.status = CheckoutDeviceStatus.OFFLINE;
        locked.current_ticket_id = null;
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
