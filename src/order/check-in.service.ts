import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus, OrderType } from '../entities/order.entity';
import { ActivityRegistration } from '../entities/activity-registration.entity';
import { Activity, ActivityStatus } from '../entities/activity.entity';
import { User } from '../entities/user.entity';
import { CheckInGateway } from './check-in.gateway';
import {
  ActivityRegistrationEntryService,
  type ActivityRegistrationEntryLine,
} from '../activity-registration/activity-registration-entry.service';

export interface CheckInLookupResult {
  registration_id: number;
  registration_no: string;
  /** เลขที่ Order ที่ผูกกับใบสมัคร (ถ้ามี) */
  order_no: string | null;
  applicant_name: string;
  activity_id: number;
  activity_title: string;
  entries_summary: string;
  payment_status: string;
  checked_in_at: string | null;
}

export interface CheckInHistoryEntry {
  registration_no: string;
  order_no: string | null;
  applicant_name: string;
  applicant_email: string | null;
  applicant_phone: string | null;
  avatar_url: string | null;
  activity_title: string;
  checked_in_at: string;
}

export interface CheckInStats {
  checked_in_today: number;
  total_checked_in: number;
}

export interface AdminCheckInActivityItem {
  activity_id: number;
  title: string;
  slug: string;
  start_date: string;
  end_date: string;
  status: string;
  location_name: string;
  checked_in_today: number;
  total_checked_in: number;
  check_in_code: string;
}

export interface MyCheckInActivityItem {
  activity_id: number;
  title: string;
  slug: string;
  start_date: string;
  end_date: string;
  location_name: string;
  registration_id: number;
  registration_no: string;
  order_no: string | null;
  /** จำนวนใบสมัคร (ออเดอร์) ที่ชำระแล้วของกิจกรรมนี้ */
  registration_count: number;
  /** จำนวนใบที่ยังไม่เช็คอิน */
  pending_count: number;
  checked_in_at: string | null;
  can_check_in: boolean;
}

export interface CheckInSelfPreviewEntry {
  package_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  entry_code?: string | null;
}

export interface CheckInSelfPreviewRegistration {
  registration_id: number;
  registration_no: string;
  order_no: string | null;
  total_amount: number;
  already_checked_in: boolean;
  checked_in_at: string | null;
  entries: CheckInSelfPreviewEntry[];
}

export interface CheckInSelfPreview {
  activity_id: number;
  activity_title: string;
  activity_location: string;
  applicant_name: string;
  phone: string;
  /** ยอดรวมทุกใบสมัคร */
  total_amount: number;
  /** จำนวนใบสมัครทั้งหมดของกิจกรรมนี้ (ที่ชำระแล้ว) */
  registration_count: number;
  /** จำนวนใบที่ยังไม่เช็คอิน */
  pending_count: number;
  /** true เมื่อทุกใบเช็คอินแล้ว */
  already_checked_in: boolean;
  /** เวลาเช็คอินล่าสุด (ถ้ามี) */
  checked_in_at: string | null;
  /** ใบสมัครแต่ละใบพร้อมรายการ */
  registrations: CheckInSelfPreviewRegistration[];
  /** รายการรวมทุกใบ (สรุป) */
  entries: CheckInSelfPreviewEntry[];
}

export interface CheckInSelfConfirmResult {
  activity_title: string;
  /** จำนวนใบที่เช็คอินสำเร็จในครั้งนี้ */
  checked_in_count: number;
  /** จำนวนใบที่เช็คอินไปแล้วก่อนหน้า */
  already_count: number;
  /** จำนวนใบสมัครทั้งหมดของกิจกรรมนี้ */
  total_count: number;
}

export const ACTIVITY_CHECK_IN_PREFIX = 'BM:CHECKIN:ACTIVITY:';

export interface CheckInGeoCoords {
  latitude: number;
  longitude: number;
}

/** ระยะทางระหว่างสองพิกัด (เมตร) — Haversine */
export function haversineDistanceM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function buildActivityCheckInCode(activityId: number): string {
  return `${ACTIVITY_CHECK_IN_PREFIX}${activityId}`;
}

export function parseActivityCheckInCode(code: string): number | null {
  const raw = (code || '').trim();
  const direct = raw.match(/^BM:CHECKIN:ACTIVITY:(\d+)$/i);
  if (direct) {
    const id = parseInt(direct[1], 10);
    return Number.isFinite(id) ? id : null;
  }
  const urlMatch = raw.match(/\/profile\/check-in\/(\d+)(?:[/?#]|$)/i);
  if (urlMatch) {
    const id = parseInt(urlMatch[1], 10);
    return Number.isFinite(id) ? id : null;
  }
  return null;
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
    private readonly checkInGateway: CheckInGateway,
    private readonly entryService: ActivityRegistrationEntryService,
  ) {}

  private assertWithinCheckInTime(activity: Activity): void {
    const now = new Date();
    if (
      activity.check_in_open_at &&
      now.getTime() < activity.check_in_open_at.getTime()
    ) {
      throw new BadRequestException(
        `ยังไม่ถึงเวลาเปิดเช็คอิน (เริ่มเช็คอินได้ตั้งแต่ ${activity.check_in_open_at.toLocaleString('th-TH')})`,
      );
    }
    if (
      activity.check_in_close_at &&
      now.getTime() > activity.check_in_close_at.getTime()
    ) {
      throw new BadRequestException(
        `หมดเวลาเช็คอินแล้ว (ปิดเช็คอินเมื่อ ${activity.check_in_close_at.toLocaleString('th-TH')})`,
      );
    }
  }

  private assertWithinCheckInGeofence(
    activity: Activity,
    coords?: CheckInGeoCoords | null,
  ): void {
    if (!activity.check_in_geofence_enabled) return;

    const venueLat =
      activity.location_latitude != null
        ? Number(activity.location_latitude)
        : NaN;
    const venueLng =
      activity.location_longitude != null
        ? Number(activity.location_longitude)
        : NaN;

    if (!Number.isFinite(venueLat) || !Number.isFinite(venueLng)) {
      throw new BadRequestException(
        'กิจกรรมนี้ยังไม่ได้ตั้งพิกัดสถานที่ — ไม่สามารถเช็คอินได้',
      );
    }

    const userLat = coords?.latitude;
    const userLng = coords?.longitude;
    if (
      userLat == null ||
      userLng == null ||
      !Number.isFinite(userLat) ||
      !Number.isFinite(userLng)
    ) {
      throw new BadRequestException(
        'กรุณาเปิดตำแหน่งที่ตั้ง (GPS) เพื่อเช็คอินกิจกรรมนี้',
      );
    }

    const radiusM = Math.max(
      50,
      Number(activity.check_in_geofence_radius_m) || 200,
    );
    const distanceM = haversineDistanceM(userLat, userLng, venueLat, venueLng);
    if (distanceM > radiusM) {
      throw new BadRequestException(
        `คุณอยู่นอกพื้นที่จัดกิจกรรม (ห่างจากจุดจัดงาน ${Math.round(distanceM)} ม. เกินรัศมี ${radiusM} ม.) กรุณาเข้าใกล้สถานที่จัดงานก่อนเช็คอิน`,
      );
    }
  }

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
    const entryLines = await this.entryService.resolveLinesForRegistration(reg);
    if (entryLines.length > 0) {
      const totalQty = entryLines.reduce(
        (s, e) => s + (Number(e.quantity) || 0),
        0,
      );
      entriesLabel = `${totalQty} รายการ`;
    }

    return {
      registration_id: reg.id,
      registration_no: reg.registration_no,
      order_no:
        order?.order_no != null && String(order.order_no).trim() !== ''
          ? String(order.order_no).trim()
          : null,
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
  async submit(
    registrationId: number,
  ): Promise<{ checked_in_at: string; registration_no: string }> {
    const reg = await this.registrationRepository.findOne({
      where: { id: registrationId },
    });
    if (!reg) {
      throw new NotFoundException('ไม่พบข้อมูลการสมัคร');
    }
    const activity = await this.activityRepository.findOne({
      where: { id: reg.activity_id },
    });

    if (activity) {
      this.assertWithinCheckInTime(activity);
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

    this.checkInGateway.notifyTicketCheckedIn(reg.registration_no);

    return {
      checked_in_at: reg.checked_in_at.toISOString(),
      registration_no: reg.registration_no,
    };
  }

  /**
   * ประวัติการเช็คอิน (ล่าสุดก่อน)
   */
  async getHistory(
    page: number = 1,
    limit: number = 20,
    options?: { date_from?: string; date_to?: string; activity_id?: number },
  ): Promise<{ items: CheckInHistoryEntry[]; total: number }> {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const safePage = Math.max(1, page);

    const countQb = this.registrationRepository
      .createQueryBuilder('reg')
      .where('reg.checked_in_at IS NOT NULL');

    if (options?.date_from) {
      countQb.andWhere('reg.checked_in_at >= :date_from', {
        date_from: options.date_from,
      });
    }
    if (options?.date_to) {
      countQb.andWhere('reg.checked_in_at <= :date_to', {
        date_to: options.date_to,
      });
    }
    if (options?.activity_id) {
      countQb.andWhere('reg.activity_id = :activity_id', {
        activity_id: options.activity_id,
      });
    }

    const total = await countQb.getCount();

    const listQb = this.registrationRepository
      .createQueryBuilder('reg')
      .innerJoin(Activity, 'a', 'a.id = reg.activity_id')
      .leftJoin(
        Order,
        'o',
        'o.refer_id = reg.id AND o.type = :historyOrderType',
        { historyOrderType: OrderType.ACTIVITY_REGISTRATION },
      )
      .leftJoin(User, 'u', 'u.id = reg.user_id')
      .select([
        'reg.registration_no',
        'reg.applicant_name',
        'reg.email',
        'reg.phone',
        'reg.checked_in_at',
      ])
      .addSelect('a.title', 'activity_title')
      .addSelect('o.order_no', 'order_no')
      .addSelect('u.avatar_url', 'avatar_url')
      .where('reg.checked_in_at IS NOT NULL')
      .orderBy('reg.checked_in_at', 'DESC');

    if (options?.date_from) {
      listQb.andWhere('reg.checked_in_at >= :date_from', {
        date_from: options.date_from,
      });
    }
    if (options?.date_to) {
      listQb.andWhere('reg.checked_in_at <= :date_to', {
        date_to: options.date_to,
      });
    }
    if (options?.activity_id) {
      listQb.andWhere('reg.activity_id = :activity_id', {
        activity_id: options.activity_id,
      });
    }

    const raws = await listQb
      .offset((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .getRawMany();

    const items: CheckInHistoryEntry[] = (raws || []).map((r: any) => {
      const emailRaw = r.reg_email;
      const phoneRaw = r.reg_phone;
      const orderNoRaw = r.order_no;
      const avatarRaw = r.avatar_url;
      return {
        registration_no: r.reg_registration_no ?? '',
        order_no:
          orderNoRaw != null && String(orderNoRaw).trim() !== ''
            ? String(orderNoRaw).trim()
            : null,
        applicant_name: r.reg_applicant_name ?? '',
        applicant_email:
          emailRaw != null && String(emailRaw).trim() !== ''
            ? String(emailRaw).trim()
            : null,
        applicant_phone:
          phoneRaw != null && String(phoneRaw).trim() !== ''
            ? String(phoneRaw).trim()
            : null,
        avatar_url:
          avatarRaw != null && String(avatarRaw).trim() !== ''
            ? String(avatarRaw).trim()
            : null,
        activity_title: r.activity_title ?? '',
        checked_in_at:
          r.reg_checked_in_at instanceof Date
            ? r.reg_checked_in_at.toISOString()
            : String(r.reg_checked_in_at ?? ''),
      };
    });

    return { items, total };
  }

  /**
   * สถิติ: จำนวนที่เช็คอินวันนี้ และทั้งหมด
   */
  async getStats(activityId?: number): Promise<CheckInStats> {
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

    const todayQb = this.registrationRepository
      .createQueryBuilder('reg')
      .where('reg.checked_in_at BETWEEN :todayStart AND :todayEnd', {
        todayStart,
        todayEnd,
      });
    const totalQb = this.registrationRepository
      .createQueryBuilder('reg')
      .where('reg.checked_in_at IS NOT NULL');

    if (activityId) {
      todayQb.andWhere('reg.activity_id = :activityId', { activityId });
      totalQb.andWhere('reg.activity_id = :activityId', { activityId });
    }

    const [checkedInToday, totalCheckedIn] = await Promise.all([
      todayQb.getCount(),
      totalQb.getCount(),
    ]);

    return {
      checked_in_today: checkedInToday,
      total_checked_in: totalCheckedIn,
    };
  }

  async listActivitiesForAdmin(): Promise<AdminCheckInActivityItem[]> {
    const activities = await this.activityRepository
      .createQueryBuilder('a')
      .where('a.deleted_at IS NULL')
      .andWhere('a.status != :draft', { draft: ActivityStatus.DRAFT })
      .orderBy('a.start_date', 'DESC')
      .addOrderBy('a.title', 'ASC')
      .getMany();

    const items: AdminCheckInActivityItem[] = [];
    for (const activity of activities) {
      const stats = await this.getStats(activity.id);
      items.push({
        activity_id: activity.id,
        title: activity.title,
        slug: activity.slug,
        start_date:
          activity.start_date instanceof Date
            ? activity.start_date.toISOString().slice(0, 10)
            : String(activity.start_date),
        end_date:
          activity.end_date instanceof Date
            ? activity.end_date.toISOString().slice(0, 10)
            : String(activity.end_date),
        status: activity.status,
        location_name: activity.location_name,
        checked_in_today: stats.checked_in_today,
        total_checked_in: stats.total_checked_in,
        check_in_code: buildActivityCheckInCode(activity.id),
      });
    }
    return items;
  }

  async listMyCheckInActivities(
    userId: number,
  ): Promise<MyCheckInActivityItem[]> {
    const raws = await this.orderRepository
      .createQueryBuilder('o')
      .innerJoin(ActivityRegistration, 'reg', 'reg.id = o.refer_id')
      .innerJoin(Activity, 'a', 'a.id = reg.activity_id')
      .select([
        'a.id AS activity_id',
        'a.title AS title',
        'a.slug AS slug',
        'a.start_date AS start_date',
        'a.end_date AS end_date',
        'a.location_name AS location_name',
        'a.check_in_open_at AS check_in_open_at',
        'a.check_in_close_at AS check_in_close_at',
        'reg.id AS registration_id',
        'reg.registration_no AS registration_no',
        'reg.checked_in_at AS checked_in_at',
        'o.order_no AS order_no',
        'o.status AS order_status',
      ])
      .where('o.user_id = :userId', { userId })
      .andWhere('o.type = :type', { type: OrderType.ACTIVITY_REGISTRATION })
      .andWhere('o.status = :status', { status: OrderStatus.PAID })
      .andWhere('a.deleted_at IS NULL')
      .orderBy('a.start_date', 'DESC')
      .addOrderBy('a.title', 'ASC')
      .getRawMany();

    const now = new Date();

    interface RegRow {
      registration_id: number;
      registration_no: string;
      order_no: string | null;
      checked_in_at: string | null;
    }
    interface ActivityGroup {
      base: MyCheckInActivityItem;
      withinWindow: boolean;
      regs: RegRow[];
    }

    const byActivity = new Map<number, ActivityGroup>();

    for (const row of raws || []) {
      const activityId = Number(row.activity_id);
      const checkedInAt =
        row.checked_in_at instanceof Date
          ? row.checked_in_at.toISOString()
          : row.checked_in_at
            ? String(row.checked_in_at)
            : null;

      let group = byActivity.get(activityId);
      if (!group) {
        const openAt =
          row.check_in_open_at instanceof Date
            ? row.check_in_open_at
            : row.check_in_open_at
              ? new Date(String(row.check_in_open_at))
              : null;
        const closeAt =
          row.check_in_close_at instanceof Date
            ? row.check_in_close_at
            : row.check_in_close_at
              ? new Date(String(row.check_in_close_at))
              : null;
        const withinWindow =
          (!openAt || now.getTime() >= openAt.getTime()) &&
          (!closeAt || now.getTime() <= closeAt.getTime());

        group = {
          withinWindow,
          regs: [],
          base: {
            activity_id: activityId,
            title: row.title ?? '',
            slug: row.slug ?? '',
            start_date:
              row.start_date instanceof Date
                ? row.start_date.toISOString().slice(0, 10)
                : String(row.start_date ?? ''),
            end_date:
              row.end_date instanceof Date
                ? row.end_date.toISOString().slice(0, 10)
                : String(row.end_date ?? ''),
            location_name: row.location_name ?? '',
            registration_id: 0,
            registration_no: '',
            order_no: null,
            registration_count: 0,
            pending_count: 0,
            checked_in_at: null,
            can_check_in: false,
          },
        };
        byActivity.set(activityId, group);
      }

      group.regs.push({
        registration_id: Number(row.registration_id),
        registration_no: row.registration_no ?? '',
        order_no:
          row.order_no != null && String(row.order_no).trim() !== ''
            ? String(row.order_no).trim()
            : null,
        checked_in_at: checkedInAt,
      });
    }

    return [...byActivity.values()].map((group) => {
      const pending = group.regs.filter((r) => !r.checked_in_at);
      // ใบตัวแทน: ใช้ใบที่ยังไม่เช็คอินใบแรก (ถ้ามี) ไม่งั้นใบแรก
      const representative = pending[0] ?? group.regs[0]!;
      const latestCheckedIn =
        group.regs
          .map((r) => r.checked_in_at)
          .filter((v): v is string => !!v)
          .sort()
          .at(-1) ?? null;

      return {
        ...group.base,
        registration_id: representative.registration_id,
        registration_no: representative.registration_no,
        order_no: representative.order_no,
        registration_count: group.regs.length,
        pending_count: pending.length,
        checked_in_at: pending.length ? null : latestCheckedIn,
        can_check_in: pending.length > 0 && group.withinWindow,
      };
    });
  }

  /**
   * ใบสมัครทั้งหมดของผู้ใช้ที่ชำระเงินแล้วในกิจกรรมนี้ (เรียงตาม id — เลขปลาน้อยไปมาก)
   */
  private async findPaidRegistrationRowsForActivity(
    userId: number,
    activityId: number,
  ): Promise<{ registration_id: number; order_no: string | null }[]> {
    const raws = await this.orderRepository
      .createQueryBuilder('o')
      .innerJoin(ActivityRegistration, 'reg', 'reg.id = o.refer_id')
      .select(['reg.id AS registration_id', 'o.order_no AS order_no'])
      .where('o.user_id = :userId', { userId })
      .andWhere('o.type = :type', { type: OrderType.ACTIVITY_REGISTRATION })
      .andWhere('o.status = :status', { status: OrderStatus.PAID })
      .andWhere('reg.activity_id = :activityId', { activityId })
      .orderBy('reg.id', 'ASC')
      .getRawMany();

    const seen = new Set<number>();
    const rows: { registration_id: number; order_no: string | null }[] = [];
    for (const r of raws || []) {
      const id = Number(r.registration_id);
      if (!Number.isFinite(id) || seen.has(id)) continue;
      seen.add(id);
      rows.push({
        registration_id: id,
        order_no:
          r.order_no != null && String(r.order_no).trim() !== ''
            ? String(r.order_no).trim()
            : null,
      });
    }
    return rows;
  }

  async previewSelfCheckIn(
    userId: number,
    code: string,
    coords?: CheckInGeoCoords | null,
  ): Promise<CheckInSelfPreview> {
    const activityId = parseActivityCheckInCode(code);
    if (activityId == null) {
      throw new BadRequestException('QR Code ไม่ถูกต้อง');
    }

    const activity = await this.activityRepository.findOne({
      where: { id: activityId },
    });
    if (!activity || activity.deleted_at) {
      throw new NotFoundException('ไม่พบกิจกรรม');
    }

    this.assertWithinCheckInTime(activity);
    this.assertWithinCheckInGeofence(activity, coords);

    const regRows = await this.findPaidRegistrationRowsForActivity(
      userId,
      activityId,
    );
    if (!regRows.length) {
      throw new BadRequestException(
        'คุณยังไม่มีใบสมัครที่ชำระเงินแล้วสำหรับกิจกรรมนี้',
      );
    }

    // โหลดใบสมัคร + รายการปลาให้ครบก่อน แล้ว resolve ชื่อแพ็กเกจ (ตัวลูกสุด) ครั้งเดียว
    const loaded: {
      row: { registration_id: number; order_no: string | null };
      reg: ActivityRegistration;
      entryLines: ActivityRegistrationEntryLine[];
    }[] = [];
    const packageIdSet = new Set<number>();
    for (const row of regRows) {
      const reg = await this.registrationRepository.findOne({
        where: { id: row.registration_id },
      });
      if (!reg) continue;
      const entryLines =
        await this.entryService.resolveLinesForRegistration(reg);
      for (const line of entryLines) {
        packageIdSet.add(Number(line.package_id));
      }
      loaded.push({ row, reg, entryLines });
    }

    const packageNameById = await this.entryService.resolvePackageLeafNames([
      ...packageIdSet,
    ]);

    const registrations: CheckInSelfPreviewRegistration[] = [];
    const allEntries: CheckInSelfPreviewEntry[] = [];
    let totalAmount = 0;
    let pendingCount = 0;
    let applicantName = '';
    let phone = '';
    let latestCheckedInAt: string | null = null;

    for (const { row, reg, entryLines } of loaded) {
      const entries = this.entryLinesToPreviewEntries(
        entryLines,
        packageNameById,
      );
      const checkedInAt = reg.checked_in_at
        ? reg.checked_in_at.toISOString()
        : null;
      const already = !!checkedInAt;
      if (!already) pendingCount += 1;
      if (
        checkedInAt &&
        (!latestCheckedInAt || checkedInAt > latestCheckedInAt)
      ) {
        latestCheckedInAt = checkedInAt;
      }
      totalAmount += Number(reg.total_amount ?? 0);
      if (!applicantName) applicantName = reg.applicant_name ?? '';
      if (!phone) phone = reg.phone ?? '';

      registrations.push({
        registration_id: reg.id,
        registration_no: reg.registration_no,
        order_no: row.order_no,
        total_amount: Number(reg.total_amount ?? 0),
        already_checked_in: already,
        checked_in_at: checkedInAt,
        entries,
      });
      allEntries.push(...entries);
    }

    return {
      activity_id: activityId,
      activity_title: activity.title,
      activity_location: activity.location_name,
      applicant_name: applicantName,
      phone,
      total_amount: totalAmount,
      registration_count: registrations.length,
      pending_count: pendingCount,
      already_checked_in: pendingCount === 0,
      checked_in_at: latestCheckedInAt,
      registrations,
      entries: allEntries,
    };
  }

  async confirmSelfCheckIn(
    userId: number,
    code: string,
    coords?: CheckInGeoCoords | null,
  ): Promise<CheckInSelfConfirmResult> {
    const activityId = parseActivityCheckInCode(code);
    if (activityId == null) {
      throw new BadRequestException('QR Code ไม่ถูกต้อง');
    }
    return this.submitSelfCheckIn(userId, activityId, code, coords);
  }

  private entryLinesToPreviewEntries(
    lines: ActivityRegistrationEntryLine[],
    packageNameById?: Map<number, string>,
  ): CheckInSelfPreviewEntry[] {
    return lines.map((line) => {
      const pkgId = Number(line.package_id);
      const name =
        packageNameById?.get(pkgId) ?? (pkgId ? `แพ็กเกจ #${pkgId}` : '—');
      return {
        package_name: name,
        quantity: Number(line.quantity) || 1,
        unit_price: Number(line.unit_price) || 0,
        line_total: Number(line.line_total) || 0,
        entry_code: line.entry_code != null ? String(line.entry_code) : null,
      };
    });
  }

  async submitSelfCheckIn(
    userId: number,
    activityId: number,
    code: string,
    coords?: CheckInGeoCoords | null,
  ): Promise<CheckInSelfConfirmResult> {
    const parsedActivityId = parseActivityCheckInCode(code);
    if (parsedActivityId == null) {
      throw new BadRequestException('QR Code ไม่ถูกต้อง');
    }
    if (parsedActivityId !== activityId) {
      throw new BadRequestException('QR Code ไม่ตรงกับกิจกรรมที่เลือก');
    }

    const activity = await this.activityRepository.findOne({
      where: { id: activityId },
    });
    if (!activity || activity.deleted_at) {
      throw new NotFoundException('ไม่พบกิจกรรม');
    }

    this.assertWithinCheckInTime(activity);
    this.assertWithinCheckInGeofence(activity, coords);

    const regRows = await this.findPaidRegistrationRowsForActivity(
      userId,
      activityId,
    );
    if (!regRows.length) {
      throw new BadRequestException(
        'คุณยังไม่มีใบสมัครที่ชำระเงินแล้วสำหรับกิจกรรมนี้',
      );
    }

    const now = new Date();
    let checkedInCount = 0;
    let alreadyCount = 0;

    // เช็คอินทุกใบสมัครของกิจกรรมนี้พร้อมกัน — ข้ามใบที่เช็คอินไปแล้ว
    for (const row of regRows) {
      const reg = await this.registrationRepository.findOne({
        where: { id: row.registration_id },
      });
      if (!reg) continue;
      if (reg.checked_in_at) {
        alreadyCount += 1;
        continue;
      }
      reg.checked_in_at = now;
      await this.registrationRepository.save(reg);
      this.checkInGateway.notifyTicketCheckedIn(reg.registration_no);
      checkedInCount += 1;
    }

    if (checkedInCount === 0) {
      throw new BadRequestException(
        alreadyCount > 0
          ? 'ทุกใบสมัครของกิจกรรมนี้เช็คอินไปแล้ว'
          : 'ไม่มีใบสมัครที่เช็คอินได้',
      );
    }

    return {
      activity_title: activity.title,
      checked_in_count: checkedInCount,
      already_count: alreadyCount,
      total_count: regRows.length,
    };
  }
}
