import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Order, OrderStatus, OrderType } from '../entities/order.entity';
import { ActivityRegistration } from '../entities/activity-registration.entity';
import { Activity } from '../entities/activity.entity';

export interface CheckInLookupResult {
  registration_id: number;
  registration_no: string;
  applicant_name: string;
  activity_id: number;
  activity_title: string;
  entries_summary: string;
  payment_status: string;
  checked_in_at: string | null;
}

export interface CheckInHistoryEntry {
  registration_no: string;
  applicant_name: string;
  activity_title: string;
  checked_in_at: string;
}

export interface CheckInStats {
  checked_in_today: number;
  total_checked_in: number;
}

@Injectable()
export class CheckInService {
  constructor(
    @InjectRepository(ActivityRegistration)
    private readonly registrationRepository: Repository<ActivityRegistration>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
  ) {}

  /**
   * ค้นหาผู้สมัครจากรหัส (registration_no หรือ order_no)
   */
  async lookup(code: string): Promise<CheckInLookupResult> {
    const raw = (code || '').toString().trim();
    if (!raw) {
      throw new BadRequestException('กรุณาระบุรหัส');
    }
    const normalized = raw.startsWith('#') ? raw.slice(1) : raw;

    // ลองหาจาก registration_no ก่อน
    let reg = await this.registrationRepository.findOne({
      where: { registration_no: normalized },
    });
    if (!reg) {
      reg = await this.registrationRepository.findOne({
        where: { registration_no: raw },
      });
    }
    if (!reg) {
      // ลองจาก order_no
      const order = await this.orderRepository.findOne({
        where: {
          order_no: normalized,
          type: OrderType.ACTIVITY_REGISTRATION,
        },
      });
      if (order) {
        reg = await this.registrationRepository.findOne({
          where: { id: order.refer_id },
        });
      }
    }
    if (!reg) {
      throw new NotFoundException('ไม่พบข้อมูลผู้สมัครในระบบ');
    }

    const order = await this.orderRepository.findOne({
      where: {
        refer_id: reg.id,
        type: OrderType.ACTIVITY_REGISTRATION,
      },
    });
    const activity = await this.activityRepository.findOne({
      where: { id: reg.activity_id },
    });

    const paymentStatus =
      order?.status === OrderStatus.PAID
        ? 'ชำระแล้ว'
        : order?.status === OrderStatus.PENDING
          ? 'รอดำเนินการ'
          : 'ยกเลิก';

    let entriesLabel = '—';
    try {
      const entries = JSON.parse(reg.entries_json || '[]');
      if (Array.isArray(entries) && entries.length > 0) {
        const totalQty = entries.reduce(
          (s: number, e: any) => s + (Number(e.quantity) || 0),
          0,
        );
        entriesLabel = `${totalQty} รายการ`;
      }
    } catch {
      // keep default
    }

    return {
      registration_id: reg.id,
      registration_no: reg.registration_no,
      applicant_name: reg.applicant_name,
      activity_id: reg.activity_id,
      activity_title: activity?.title ?? '',
      entries_summary: entriesLabel,
      payment_status: paymentStatus,
      checked_in_at: reg.checked_in_at ? reg.checked_in_at.toISOString() : null,
    };
  }

  /**
   * บันทึกการเช็คอิน (ได้เฉพาะเมื่อ Order เป็น paid แล้วเท่านั้น)
   */
  async submit(registrationId: number): Promise<{ checked_in_at: string }> {
    const reg = await this.registrationRepository.findOne({
      where: { id: registrationId },
    });
    if (!reg) {
      throw new NotFoundException('ไม่พบข้อมูลการสมัคร');
    }
    if (reg.checked_in_at) {
      throw new BadRequestException(
        'เช็คอินไปแล้วเมื่อ ' + reg.checked_in_at.toLocaleString('th-TH'),
      );
    }
    const order = await this.orderRepository.findOne({
      where: {
        refer_id: reg.id,
        type: OrderType.ACTIVITY_REGISTRATION,
      },
    });
    if (!order || order.status !== OrderStatus.PAID) {
      throw new BadRequestException(
        'เช็คอินได้เฉพาะเมื่อชำระเงินแล้วเท่านั้น กรุณาอนุมัติการชำระเงินก่อน',
      );
    }
    reg.checked_in_at = new Date();
    await this.registrationRepository.save(reg);
    return { checked_in_at: reg.checked_in_at.toISOString() };
  }

  /**
   * ประวัติการเช็คอิน (ล่าสุดก่อน)
   */
  async getHistory(
    page: number = 1,
    limit: number = 20,
    options?: { date_from?: string; date_to?: string },
  ): Promise<{ items: CheckInHistoryEntry[]; total: number }> {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const safePage = Math.max(1, page);

    const qb = this.registrationRepository
      .createQueryBuilder('reg')
      .innerJoin(Activity, 'a', 'a.id = reg.activity_id')
      .select([
        'reg.registration_no',
        'reg.applicant_name',
        'reg.checked_in_at',
      ])
      .addSelect('a.title', 'activity_title')
      .where('reg.checked_in_at IS NOT NULL')
      .orderBy('reg.checked_in_at', 'DESC');

    if (options?.date_from) {
      qb.andWhere('reg.checked_in_at >= :date_from', {
        date_from: options.date_from,
      });
    }
    if (options?.date_to) {
      qb.andWhere('reg.checked_in_at <= :date_to', {
        date_to: options.date_to,
      });
    }

    const total = await qb.getCount();
    const raws = await qb
      .offset((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .getRawMany();

    const items: CheckInHistoryEntry[] = (raws || []).map((r: any) => ({
      registration_no: r.reg_registration_no ?? '',
      applicant_name: r.reg_applicant_name ?? '',
      activity_title: r.activity_title ?? '',
      checked_in_at:
        r.reg_checked_in_at instanceof Date
          ? r.reg_checked_in_at.toISOString()
          : String(r.reg_checked_in_at ?? ''),
    }));

    return { items, total };
  }

  /**
   * สถิติ: จำนวนที่เช็คอินวันนี้ และทั้งหมด
   */
  async getStats(): Promise<CheckInStats> {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const todayEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );

    const [checkedInToday, totalCheckedIn] = await Promise.all([
      this.registrationRepository.count({
        where: {
          checked_in_at: Between(todayStart, todayEnd),
        },
      }),
      this.registrationRepository
        .createQueryBuilder('reg')
        .where('reg.checked_in_at IS NOT NULL')
        .getCount(),
    ]);

    return {
      checked_in_today: checkedInToday,
      total_checked_in: totalCheckedIn,
    };
  }
}
