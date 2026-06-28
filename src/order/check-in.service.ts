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

export interface CheckInSelfPreview {
  activity_id: number;
  activity_title: string;
  activity_location: string;
  registration_id: number;
  registration_no: string;
  order_no: string | null;
  applicant_name: string;
  phone: string;
  total_amount: number;
  already_checked_in: boolean;
  checked_in_at: string | null;
  entries: CheckInSelfPreviewEntry[];
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
  ) {}

  private assertWithinCheckInGeofence(
    activity: Activity,
    coords?: CheckInGeoCoords | null,
  ): void {
    if (!activity.check_in_geofence_enabled) return;

    const venueLat = activity.location_latitude != null
      ? Number(activity.location_latitude)
      : NaN;
    const venueLng = activity.location_longitude != null
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

    const radiusM = Math.max(50, Number(activity.check_in_geofence_radius_m) || 200);
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

  async listMyCheckInActivities(userId: number): Promise<MyCheckInActivityItem[]> {
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

    return (raws || []).map((row: any) => {
      const checkedInAt =
        row.checked_in_at instanceof Date
          ? row.checked_in_at.toISOString()
          : row.checked_in_at
            ? String(row.checked_in_at)
            : null;
      return {
        activity_id: Number(row.activity_id),
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
        registration_id: Number(row.registration_id),
        registration_no: row.registration_no ?? '',
        order_no:
          row.order_no != null && String(row.order_no).trim() !== ''
            ? String(row.order_no).trim()
            : null,
        checked_in_at: checkedInAt,
        can_check_in: !checkedInAt,
      };
    });
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

    this.assertWithinCheckInGeofence(activity, coords);

    const raw = await this.orderRepository
      .createQueryBuilder('o')
      .innerJoin(ActivityRegistration, 'reg', 'reg.id = o.refer_id')
      .select([
        'reg.id AS registration_id',
        'reg.registration_no AS registration_no',
        'reg.applicant_name AS applicant_name',
        'reg.phone AS phone',
        'reg.entries_json AS entries_json',
        'reg.total_amount AS total_amount',
        'reg.checked_in_at AS checked_in_at',
        'o.order_no AS order_no',
      ])
      .where('o.user_id = :userId', { userId })
      .andWhere('o.type = :type', { type: OrderType.ACTIVITY_REGISTRATION })
      .andWhere('o.status = :status', { status: OrderStatus.PAID })
      .andWhere('reg.activity_id = :activityId', { activityId })
      .getRawOne();

    if (!raw?.registration_id) {
      throw new BadRequestException(
        'คุณยังไม่มีใบสมัครที่ชำระเงินแล้วสำหรับกิจกรรมนี้',
      );
    }

    const entries = this.parseRegistrationEntries(String(raw.entries_json ?? '[]'));
    const checkedInAt =
      raw.checked_in_at instanceof Date
        ? raw.checked_in_at.toISOString()
        : raw.checked_in_at
          ? String(raw.checked_in_at)
          : null;

    return {
      activity_id: activityId,
      activity_title: activity.title,
      activity_location: activity.location_name,
      registration_id: Number(raw.registration_id),
      registration_no: raw.registration_no ?? '',
      order_no:
        raw.order_no != null && String(raw.order_no).trim() !== ''
          ? String(raw.order_no).trim()
          : null,
      applicant_name: raw.applicant_name ?? '',
      phone: raw.phone ?? '',
      total_amount: Number(raw.total_amount ?? 0),
      already_checked_in: !!checkedInAt,
      checked_in_at: checkedInAt,
      entries,
    };
  }

  async confirmSelfCheckIn(
    userId: number,
    code: string,
    coords?: CheckInGeoCoords | null,
  ): Promise<{ checked_in_at: string; registration_no: string; activity_title: string }> {
    const activityId = parseActivityCheckInCode(code);
    if (activityId == null) {
      throw new BadRequestException('QR Code ไม่ถูกต้อง');
    }
    return this.submitSelfCheckIn(userId, activityId, code, coords);
  }

  private parseRegistrationEntries(
    entriesJson: string,
  ): CheckInSelfPreviewEntry[] {
    try {
      const parsed = JSON.parse(entriesJson || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.map((entry: any) => ({
        package_name: String(entry?.package_name ?? entry?.name ?? '—').trim() || '—',
        quantity: Number(entry?.quantity) || 1,
        unit_price: Number(entry?.unit_price) || 0,
        line_total: Number(entry?.line_total) || 0,
        entry_code: entry?.entry_code != null ? String(entry.entry_code) : null,
      }));
    } catch {
      return [];
    }
  }

  async submitSelfCheckIn(
    userId: number,
    activityId: number,
    code: string,
    coords?: CheckInGeoCoords | null,
  ): Promise<{ checked_in_at: string; registration_no: string; activity_title: string }> {
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

    this.assertWithinCheckInGeofence(activity, coords);

    const raw = await this.orderRepository
      .createQueryBuilder('o')
      .innerJoin(ActivityRegistration, 'reg', 'reg.id = o.refer_id')
      .select(['reg.id AS registration_id'])
      .where('o.user_id = :userId', { userId })
      .andWhere('o.type = :type', { type: OrderType.ACTIVITY_REGISTRATION })
      .andWhere('o.status = :status', { status: OrderStatus.PAID })
      .andWhere('reg.activity_id = :activityId', { activityId })
      .getRawOne();

    if (!raw?.registration_id) {
      throw new BadRequestException('คุณยังไม่มีใบสมัครที่ชำระเงินแล้วสำหรับกิจกรรมนี้');
    }

    const result = await this.submit(Number(raw.registration_id));
    return {
      ...result,
      activity_title: activity.title,
    };
  }
}
