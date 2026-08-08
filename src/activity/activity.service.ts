import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import { Activity, ActivityStatus } from '../entities/activity.entity';
import { ActivityRegistration } from '../entities/activity-registration.entity';
import { ActivitySponsorPackage } from '../entities/activity-sponsor-package.entity';
import { SponsorPackage } from '../entities/sponsor-package.entity';
import { SponsorRegistration, SponsorTier } from '../entities/sponsor.entity';
import {
  Order,
  OrderStatus,
  OrderType,
  PaymentMethod,
} from '../entities/order.entity';
import { ActivityPackageTreeNode as AptNode } from '../activity-package/activity-package.service';
import { OrderService } from '../order/order.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { UploadService } from '../upload/upload.service';
import { ActivityPackageService } from '../activity-package/activity-package.service';
import { ActivityTagService, ActivityTagDto } from './activity-tag.service';
import { generateReferenceNo } from '../common/utils/reference-no.util';
import {
  ActivityLiveEmbed,
  parseActivityLiveEmbedsJson,
  serializeActivityLiveEmbeds,
} from '../common/utils/activity-live-embeds.util';
import {
  type CompetitionDashboardPayload,
} from '../common/utils/competition-dashboard.util';
import {
  getOnsiteCashStatus,
  type OnsiteCashStatus,
} from '../common/utils/onsite-cash.util';
import { UserActionLogService } from '../user-action-log/user-action-log.service';
import { LegalPolicyService } from '../legal/legal-policy.service';
import {
  ActivityRegistrationEntryService,
  type ActivityRegistrationEntryLine,
} from '../activity-registration/activity-registration-entry.service';
import { ActivityCompetitionDashboardService } from './activity-competition-dashboard.service';

const UPLOAD_SUBDIR = 'activities' as const;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '');
}

export type ActivityAdminDetail = Activity & {
  competition_dashboard: CompetitionDashboardPayload | null;
};

export type ActivityPublicDetail = Activity & {
  price_range: { min: number | null; max: number | null };
  tags?: ActivityTagDto[];
  sponsor_packages?: SponsorPackage[];
  sponsors?: ActivityPublicSponsor[];
  live_embeds: ActivityLiveEmbed[];
  competition_dashboard: CompetitionDashboardPayload | null;
  onsite_cash: OnsiteCashStatus;
};

export interface ActivityPublicSponsor {
  id: number;
  brand_display_name: string;
  tier: SponsorTier;
  amount: number;
  logo_url: string | null;
  link_slug: string;
  socials: { type: string; label: string; url: string }[];
}

export interface ActivityLeafClass {
  id: number;
  name: string;
  full_path: string;
  price: number;
  /** slug ของโหนดใบในตาราง activity_package (เช่น A1, B2) */
  slug: string | null;
}

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    @InjectRepository(ActivityRegistration)
    private readonly registrationRepository: Repository<ActivityRegistration>,
    @InjectRepository(ActivitySponsorPackage)
    private readonly activitySponsorPkgRepo: Repository<ActivitySponsorPackage>,
    @InjectRepository(SponsorPackage)
    private readonly sponsorPackageRepo: Repository<SponsorPackage>,
    @InjectRepository(SponsorRegistration)
    private readonly sponsorRepo: Repository<SponsorRegistration>,
    private readonly uploadService: UploadService,
    private readonly activityPackageService: ActivityPackageService,
    private readonly activityTagService: ActivityTagService,
    private readonly orderService: OrderService,
    private readonly userActionLogService: UserActionLogService,
    private readonly legalPolicyService: LegalPolicyService,
    private readonly entryService: ActivityRegistrationEntryService,
    private readonly competitionDashboardService: ActivityCompetitionDashboardService,
  ) {}

  async findAll(): Promise<Activity[]> {
    return this.activityRepository.find({
      order: { start_date: 'DESC' },
      where: { deleted_at: IsNull() },
    });
  }

  /**
   * รายการกิจกรรมที่ให้แสดงในส่วน "กิจกรรมแนะนำ" บนหน้าแรก
   */
  async listFeaturedForHomepage(): Promise<
    {
      id: number;
      slug: string;
      title: string;
      cover_image: string | null;
      banner_image: string | null;
      start_date: Date;
      end_date: Date;
      location_name: string;
      status: ActivityStatus;
      registration_open_at: Date | null;
      registration_deadline: Date | null;
      homepage_featured_sort: number;
    }[]
  > {
    const qb = this.activityRepository
      .createQueryBuilder('activity')
      .where('activity.deleted_at IS NULL')
      .andWhere('activity.is_featured_homepage = :featured', {
        featured: true,
      })
      .orderBy('activity.homepage_featured_sort', 'ASC')
      .addOrderBy('activity.start_date', 'ASC')
      .addOrderBy('activity.created_at', 'DESC');

    const items = await qb.getMany();

    return items.map((a) => ({
      id: a.id,
      slug: a.slug,
      title: a.title,
      cover_image: a.cover_image,
      banner_image: a.banner_image,
      start_date: a.start_date,
      end_date: a.end_date,
      location_name: a.location_name,
      status: a.status,
      registration_open_at: a.registration_open_at,
      registration_deadline: a.registration_deadline,
      homepage_featured_sort: Number(a.homepage_featured_sort ?? 0),
    }));
  }

  /**
   * ใช้คำนวณราคารวมจาก entries ของงานที่ระบุด้วย slug
   */
  async calculateEntriesTotalForSlug(
    slug: string,
    entries: { package_id: number; quantity: number }[],
  ): Promise<{
    total_amount: number;
    items: {
      package_id: number;
      name: string;
      unit_price: number;
      quantity: number;
      line_total: number;
    }[];
  }> {
    const leafClasses = await this.getLeafClassesForSlug(slug);
    const priceMap = new Map<number, ActivityLeafClass>();
    leafClasses.forEach((c) => priceMap.set(c.id, c));

    const items = entries
      .filter((e) => e.quantity > 0)
      .map((e) => {
        const pkg = priceMap.get(e.package_id);
        if (!pkg) {
          throw new BadRequestException('พบรายการสมัครที่ไม่ถูกต้อง');
        }
        const unit_price = pkg.price ?? 0;
        const line_total = unit_price * e.quantity;
        return {
          package_id: pkg.id,
          name: pkg.full_path,
          unit_price,
          quantity: e.quantity,
          line_total,
        };
      });

    const total_amount = items.reduce((sum, i) => sum + i.line_total, 0);
    return { total_amount, items };
  }

  /**
   * เลขลำดับรายการสมัครล่าสุดของกิจกรรม (ดูจาก activity_registration_entries)
   */
  async getMaxEntryIndexForActivity(activityId: number): Promise<number> {
    return this.entryService.getMaxEntryIndexForActivity(activityId);
  }

  private buildPendingEntryLines(
    items: { package_id: number; quantity: number; unit_price: number }[],
  ): ActivityRegistrationEntryLine[] {
    const storedLines: ActivityRegistrationEntryLine[] = [];
    for (const item of items) {
      for (let k = 0; k < item.quantity; k++) {
        storedLines.push({
          index: null,
          entry_code: null,
          package_id: item.package_id,
          quantity: 1,
          unit_price: item.unit_price,
          line_total: item.unit_price,
        });
      }
    }
    return storedLines;
  }

  private assertRegistrationAllowed(
    activity: Activity,
    now: Date,
    opts: { paymentMethod: PaymentMethod; fromStaff: boolean },
  ): void {
    if (activity.status !== ActivityStatus.OPEN) {
      throw new BadRequestException('กิจกรรมนี้ไม่ได้เปิดรับสมัครแล้ว');
    }

    const pastOpen =
      !activity.registration_open_at || now >= activity.registration_open_at;
    const pastDeadline =
      !!activity.registration_deadline && now > activity.registration_deadline;
    const onsite = getOnsiteCashStatus(activity, now);

    if (opts.paymentMethod === PaymentMethod.CASH) {
      if (!opts.fromStaff && !onsite.available) {
        throw new BadRequestException('ยังไม่เปิดรับชำระเงินสดหน้างาน');
      }
      if (opts.fromStaff && !onsite.available) {
        throw new BadRequestException('ยังไม่อยู่ในช่วงรับชำระเงินสดหน้างาน');
      }
      if (
        pastDeadline &&
        !activity.allow_onsite_registration_after_deadline &&
        !opts.fromStaff
      ) {
        throw new BadRequestException('กิจกรรมนี้ปิดรับสมัครแล้ว');
      }
      if (!pastOpen && !opts.fromStaff) {
        throw new BadRequestException('กิจกรรมนี้ยังไม่ถึงเวลาเปิดรับสมัคร');
      }
      return;
    }

    if (!pastOpen) {
      throw new BadRequestException('กิจกรรมนี้ยังไม่ถึงเวลาเปิดรับสมัคร');
    }
    if (pastDeadline) {
      throw new BadRequestException('กิจกรรมนี้ปิดรับสมัครแล้ว');
    }
  }

  async createRegistrationForSlug(
    slug: string,
    payload: {
      applicant_name: string;
      farm_name?: string;
      address?: string;
      phone: string;
      email?: string;
      line?: string;
      note?: string;
      entries: { package_id: number; quantity: number }[];
      payment_slip?: string;
      payment_method?: PaymentMethod;
      accept_policies: boolean;
      terms_policy_version: string;
      privacy_policy_version: string;
    },
    userId?: number | null,
    meta?: { ip?: string | null; userAgent?: string | null },
  ): Promise<{
    registration: ActivityRegistration;
    order: {
      id: number;
      order_no: string;
      total_amount: number;
      status: string;
      payment_method: PaymentMethod;
    };
  }> {
    const activity = await this.findOneBySlug(slug);
    const now = new Date();
    const paymentMethod = payload.payment_method ?? PaymentMethod.BANK_TRANSFER;

    this.assertRegistrationAllowed(activity, now, {
      paymentMethod,
      fromStaff: false,
    });

    if (userId == null) {
      throw new BadRequestException('ต้องเข้าสู่ระบบก่อนสมัครกิจกรรม');
    }

    if (!payload.accept_policies) {
      throw new BadRequestException('กรุณายอมรับนโยบายและข้อกำหนดก่อนสมัคร');
    }

    if (
      paymentMethod === PaymentMethod.BANK_TRANSFER &&
      !payload.payment_slip?.trim()
    ) {
      throw new BadRequestException('กรุณาแนบสลิปการโอนเงิน');
    }

    await this.legalPolicyService.assertVersionsMatchActive(
      payload.terms_policy_version,
      payload.privacy_policy_version,
    );

    const { total_amount, items } = await this.calculateEntriesTotalForSlug(
      slug,
      payload.entries,
    );

    const storedLines = this.buildPendingEntryLines(items);

    const entity = this.registrationRepository.create({
      registration_no: generateReferenceNo('AR'),
      activity_id: activity.id,
      user_id: userId ?? null,
      applicant_name: payload.applicant_name,
      farm_name: payload.farm_name ?? null,
      address: payload.address ?? null,
      phone: payload.phone,
      email: payload.email ?? null,
      line: payload.line ?? null,
      note: payload.note ?? null,
      total_amount,
      payment_slip: payload.payment_slip ?? null,
    });

    const saved = await this.registrationRepository.save(entity);
    await this.entryService.createLines(saved.id, storedLines);

    await this.legalPolicyService.recordAcceptances({
      userId,
      termsVersion: payload.terms_policy_version,
      privacyVersion: payload.privacy_policy_version,
      source: 'activity_registration',
      ip: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
      relatedRegistrationId: saved.id,
    });

    // สร้าง Order สำหรับ workflow การชำระเงิน/ติดตามต่อ
    const order = await this.orderService.createActivityRegistrationOrder({
      registrationId: saved.id,
      applicantName: saved.applicant_name,
      phone: saved.phone,
      email: saved.email,
      totalAmount: total_amount,
      userId: userId ?? null,
      paymentMethod,
      markPaid: false,
    });

    await this.userActionLogService.create({
      action: 'activity_apply',
      entity_type: 'activity_registration',
      user_id: userId ?? null,
      entity_id: saved.id,
      email: saved.email ?? null,
      phone: saved.phone ?? null,
      metadata: {
        activity_id: activity.id,
        activity_slug: activity.slug,
        registration_no: saved.registration_no,
        total_amount,
        order_id: order.id,
        order_no: order.order_no,
      },
    });

    return {
      registration: saved,
      order: {
        id: order.id,
        order_no: order.order_no,
        total_amount: Number(order.total_amount),
        status: order.status,
        payment_method: order.payment_method,
      },
    };
  }

  async createOnsiteRegistrationForStaff(
    activityId: number,
    payload: {
      applicant_name: string;
      farm_name?: string;
      address?: string;
      phone: string;
      email?: string;
      line?: string;
      note?: string;
      entries: { package_id: number; quantity: number }[];
      cash_received_amount?: number;
      onsite_note?: string;
      accept_policies: boolean;
      terms_policy_version: string;
      privacy_policy_version: string;
    },
    userId: number,
    staffUserId: number,
    meta?: { ip?: string | null; userAgent?: string | null },
  ): Promise<{
    registration: ActivityRegistration;
    order: {
      id: number;
      order_no: string;
      total_amount: number;
      status: string;
      payment_method: PaymentMethod;
      registration_no: string;
    };
  }> {
    const activity = await this.findOne(activityId);
    const now = new Date();

    this.assertRegistrationAllowed(activity, now, {
      paymentMethod: PaymentMethod.CASH,
      fromStaff: true,
    });

    if (!payload.accept_policies) {
      throw new BadRequestException('กรุณายอมรับนโยบายและข้อกำหนดก่อนสมัคร');
    }

    await this.legalPolicyService.assertVersionsMatchActive(
      payload.terms_policy_version,
      payload.privacy_policy_version,
    );

    const { total_amount, items } = await this.calculateEntriesTotalForActivity(
      activity,
      payload.entries,
    );

    const storedLines = this.buildPendingEntryLines(items);

    const entity = this.registrationRepository.create({
      registration_no: generateReferenceNo('AR'),
      activity_id: activity.id,
      user_id: userId,
      applicant_name: payload.applicant_name,
      farm_name: payload.farm_name ?? null,
      address: payload.address ?? null,
      phone: payload.phone,
      email: payload.email ?? null,
      line: payload.line ?? null,
      note: payload.note ?? null,
      total_amount,
      payment_slip: null,
    });

    const saved = await this.registrationRepository.save(entity);
    await this.entryService.createLines(saved.id, storedLines);

    await this.legalPolicyService.recordAcceptances({
      userId,
      termsVersion: payload.terms_policy_version,
      privacyVersion: payload.privacy_policy_version,
      source: 'activity_registration',
      ip: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
      relatedRegistrationId: saved.id,
    });

    const received =
      payload.cash_received_amount != null
        ? payload.cash_received_amount
        : total_amount;

    const order = await this.orderService.createActivityRegistrationOrder({
      registrationId: saved.id,
      applicantName: saved.applicant_name,
      phone: saved.phone,
      email: saved.email,
      totalAmount: total_amount,
      userId,
      paymentMethod: PaymentMethod.CASH,
      markPaid: true,
      paidByUserId: staffUserId,
      cashReceivedAmount: received,
      onsiteNote: payload.onsite_note ?? null,
    });

    await this.userActionLogService.create({
      action: 'activity_apply',
      entity_type: 'activity_registration',
      user_id: userId,
      entity_id: saved.id,
      email: saved.email ?? null,
      phone: saved.phone ?? null,
      metadata: {
        activity_id: activity.id,
        registration_no: saved.registration_no,
        order_id: order.id,
        order_no: order.order_no,
        payment_method: PaymentMethod.CASH,
        staff_user_id: staffUserId,
      },
    });

    return {
      registration: saved,
      order: {
        id: order.id,
        order_no: order.order_no,
        total_amount: Number(order.total_amount),
        status: order.status,
        payment_method: order.payment_method,
        registration_no: saved.registration_no,
      },
    };
  }

  private async calculateEntriesTotalForActivity(
    activity: Activity,
    entries: { package_id: number; quantity: number }[],
  ) {
    return this.calculateEntriesTotalForSlug(activity.slug, entries);
  }

  async findPaginated(
    page: number = 1,
    limit: number = 10,
    options?: {
      status?: ActivityStatus;
      search?: string;
      /** กรองเฉพาะที่แสดง / ไม่แสดงบนหน้าแรก */
      featured?: boolean;
      /** featured = แนะนำขึ้นก่อน แล้วตามวันเริ่มงาน */
      sort?: 'start_date' | 'featured';
    },
  ): Promise<{ items: Activity[]; total: number }> {
    const qb = this.activityRepository
      .createQueryBuilder('activity')
      .where('activity.deleted_at IS NULL');

    if (options?.status) {
      qb.andWhere('activity.status = :status', {
        status: options.status,
      });
    }

    if (options?.featured === true) {
      qb.andWhere('activity.is_featured_homepage = :featured', {
        featured: true,
      });
    } else if (options?.featured === false) {
      qb.andWhere('activity.is_featured_homepage = :featured', {
        featured: false,
      });
    }

    if (options?.search) {
      const q = `%${options.search.trim()}%`;
      qb.andWhere(
        '(activity.title LIKE :q OR activity.location_name LIKE :q OR activity.slug LIKE :q)',
        { q },
      );
    }

    if (options?.sort === 'featured') {
      qb.orderBy('activity.is_featured_homepage', 'DESC')
        .addOrderBy('activity.homepage_featured_sort', 'ASC')
        .addOrderBy('activity.start_date', 'DESC');
    } else {
      qb.orderBy('activity.start_date', 'DESC');
    }

    const safeLimit = Math.min(Math.max(1, limit), 100);
    const [items, total] = await qb
      .skip((page - 1) * safeLimit)
      .take(safeLimit)
      .getManyAndCount();

    return { items, total };
  }

  /**
   * สำหรับหน้า Public: รองรับ search / status / sort จาก query string
   */
  async findPublicPaginated(
    page: number = 1,
    limit: number = 10,
    options?: {
      search?: string;
      status?: 'open' | 'upcoming' | 'finished';
      sort?: 'upcoming' | 'latest' | 'oldest';
      province_id?: number;
      sponsor_only?: boolean;
      favorite_user_id?: number;
    },
  ): Promise<{ items: Activity[]; total: number }> {
    const qb = this.activityRepository
      .createQueryBuilder('activity')
      .where('activity.deleted_at IS NULL');

    // ไม่แสดงกิจกรรมที่เป็น draft
    qb.andWhere('activity.status != :draft', {
      draft: ActivityStatus.DRAFT,
    });

    // สถานะ: ใช้ enum จริงใน DB + logic "upcoming"
    if (options?.status === 'open') {
      // แท็บเปิดรับสมัคร: แสดงทั้ง open และ upcoming (กำลังจะถึง)
      qb.andWhere('activity.status IN (:...statuses)', {
        statuses: [ActivityStatus.OPEN, ActivityStatus.UPCOMING],
      });
    } else if (options?.status === 'finished') {
      qb.andWhere('activity.status = :status', {
        status: ActivityStatus.FINISHED,
      });
    } else if (options?.status === 'upcoming') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      // รวมสถานะ upcoming ที่ตั้งมือ + งาน open ที่วันเริ่มยังไม่ถึง
      qb.andWhere(
        `(activity.status = :upcoming
          OR (activity.status = :open AND activity.start_date >= :today))`,
        {
          upcoming: ActivityStatus.UPCOMING,
          open: ActivityStatus.OPEN,
          today: today.toISOString().slice(0, 10),
        },
      );
    }

    // Filter ตามจังหวัด
    if (options?.province_id != null) {
      qb.andWhere('activity.province_id = :province_id', {
        province_id: options.province_id,
      });
    }

    if (options?.favorite_user_id != null) {
      qb.innerJoin(
        'activity_favorites',
        'af',
        'af.activity_id = activity.id AND af.user_id = :favorite_user_id',
        { favorite_user_id: options.favorite_user_id },
      );
    }

    // เฉพาะกิจกรรมที่ผูก sponsor package อย่างน้อย 1 รายการ
    if (options?.sponsor_only) {
      qb.andWhere(
        `EXISTS (
          SELECT 1
          FROM activity_sponsor_packages asp
          WHERE asp.activity_id = activity.id
        )`,
      );
    }

    // Search ตามชื่อ / สถานที่
    if (options?.search) {
      const q = `%${options.search.trim()}%`;
      qb.andWhere(
        '(activity.title LIKE :q OR activity.location_name LIKE :q)',
        { q },
      );
    }

    // จัดเรียง
    if (options?.sort === 'latest') {
      qb.orderBy('activity.start_date', 'DESC');
    } else if (options?.sort === 'oldest') {
      qb.orderBy('activity.start_date', 'ASC');
    } else {
      // upcoming: เน้นงานที่กำลังจะถึงก่อน
      qb.orderBy('activity.start_date', 'ASC');
    }

    const safeLimit = Math.min(Math.max(1, limit), 100);
    const [items, total] = await qb
      .skip((page - 1) * safeLimit)
      .take(safeLimit)
      .getManyAndCount();

    return { items, total };
  }

  async findOne(id: number): Promise<Activity> {
    const event = await this.activityRepository.findOne({
      where: { id, deleted_at: IsNull() },
    });
    if (!event) {
      throw new NotFoundException('ไม่พบกิจกรรม');
    }
    return event;
  }

  /** Admin detail — รวม competition_dashboard จากตาราง */
  async findOneAdminDetail(id: number): Promise<ActivityAdminDetail> {
    const event = await this.findOne(id);
    const competition_dashboard =
      await this.competitionDashboardService.getPayload(id);
    return {
      ...event,
      competition_dashboard,
    };
  }

  async getSponsorPackagesForActivity(
    activityId: number,
  ): Promise<SponsorPackage[]> {
    const mappings = await this.activitySponsorPkgRepo.find({
      where: { activity_id: activityId },
    });
    if (!mappings.length) return [];
    const ids = mappings.map((m) => m.sponsor_package_id);
    const uniqueIds = Array.from(new Set(ids));
    return this.sponsorPackageRepo.find({
      where: { id: In(uniqueIds), is_active: true },
      order: { amount: 'ASC' },
    });
  }

  async setSponsorPackagesForActivity(
    activityId: number,
    packageIds: number[],
  ): Promise<void> {
    await this.findOne(activityId);
    const uniqueIds = Array.from(
      new Set(
        (packageIds || []).filter(
          (id) => typeof id === 'number' && !Number.isNaN(id),
        ),
      ),
    );

    await this.activitySponsorPkgRepo.delete({ activity_id: activityId });

    if (!uniqueIds.length) return;

    const entities = uniqueIds.map((id) =>
      this.activitySponsorPkgRepo.create({
        activity_id: activityId,
        sponsor_package_id: id,
      }),
    );
    await this.activitySponsorPkgRepo.save(entities);
  }

  async findOneBySlug(slug: string): Promise<Activity> {
    const event = await this.activityRepository.findOne({
      where: { slug, deleted_at: IsNull() },
    });
    if (!event) {
      throw new NotFoundException('ไม่พบกิจกรรม');
    }
    return event;
  }

  /**
   * เปิด/ปิดการแสดงกิจกรรมบนหน้าแรก
   */
  async setHomepageFeatured(id: number, featured: boolean): Promise<Activity> {
    const activity = await this.findOne(id);
    const next = !!featured;
    if (next && !activity.is_featured_homepage) {
      const raw = await this.activityRepository
        .createQueryBuilder('activity')
        .select('MAX(activity.homepage_featured_sort)', 'max')
        .where('activity.deleted_at IS NULL')
        .andWhere('activity.is_featured_homepage = :featured', {
          featured: true,
        })
        .getRawOne<{ max: string | number | null }>();
      const maxSort = Number(raw?.max ?? 0);
      activity.homepage_featured_sort =
        Number.isFinite(maxSort) && maxSort > 0 ? maxSort + 1 : 1;
    }
    if (!next) {
      activity.homepage_featured_sort = 0;
    }
    activity.is_featured_homepage = next;
    return this.activityRepository.save(activity);
  }

  /**
   * จัดลำดับกิจกรรมแนะนำบนหน้าแรก (ids เรียงจากซ้าย/บนไปขวา/ล่าง)
   */
  async reorderHomepageFeatured(ids: number[]): Promise<Activity[]> {
    const uniqueIds = [...new Set(ids.map((id) => Number(id)).filter((id) => id > 0))];
    if (!uniqueIds.length) {
      throw new BadRequestException('กรุณาระบุลำดับกิจกรรมแนะนำ');
    }

    const rows = await this.activityRepository.find({
      where: {
        id: In(uniqueIds),
        is_featured_homepage: true,
        deleted_at: IsNull(),
      },
    });
    if (rows.length !== uniqueIds.length) {
      throw new BadRequestException(
        'พบกิจกรรมที่ไม่ใช่กิจกรรมแนะนำ หรือไม่ถูกต้องในรายการจัดลำดับ',
      );
    }

    const orderMap = new Map(uniqueIds.map((id, index) => [id, index + 1]));
    for (const row of rows) {
      row.homepage_featured_sort = orderMap.get(row.id) ?? row.homepage_featured_sort;
    }
    await this.activityRepository.save(rows);

    return this.activityRepository.find({
      where: { is_featured_homepage: true, deleted_at: IsNull() },
      order: {
        homepage_featured_sort: 'ASC',
        start_date: 'ASC',
        id: 'ASC',
      },
    });
  }

  /**
   * ตั้งตำแหน่งลำดับของกิจกรรมแนะนำ (1 = ขึ้นก่อนสุด)
   * ถ้ายังไม่ใช่แนะนำ จะเปิดแนะนำให้อัตโนมัติ
   */
  async setHomepageFeaturedSort(
    id: number,
    position: number,
  ): Promise<Activity> {
    const pos = Math.round(Number(position));
    if (!Number.isFinite(pos) || pos < 1) {
      throw new BadRequestException('ลำดับต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป');
    }

    let activity = await this.findOne(id);
    if (!activity.is_featured_homepage) {
      activity = await this.setHomepageFeatured(id, true);
    }

    const featured = await this.activityRepository.find({
      where: { is_featured_homepage: true, deleted_at: IsNull() },
      order: {
        homepage_featured_sort: 'ASC',
        start_date: 'ASC',
        id: 'ASC',
      },
    });

    const others = featured.map((row) => row.id).filter((fid) => fid !== id);
    const target = Math.min(others.length + 1, Math.max(1, pos)) - 1;
    const nextIds = [...others];
    nextIds.splice(target, 0, id);
    await this.reorderHomepageFeatured(nextIds);
    return this.findOne(id);
  }

  /**
   * สำหรับหน้า Public Detail: คืน activity พร้อมช่วงราคาจากโหนดลูกของ package (ใช้ slug)
   */
  async getPublicDetailBySlug(slug: string): Promise<ActivityPublicDetail> {
    const activity = await this.findOneBySlug(slug);
    const [price_range, tags, sponsor_packages, sponsors] = await Promise.all([
      this.activityPackageService.getLeafPriceRangeForPackage(
        activity.activity_package_id,
      ),
      this.activityTagService.getTagsForActivity(activity.id),
      this.getSponsorPackagesForActivity(activity.id),
      this.sponsorRepo
        .createQueryBuilder('sponsor')
        .innerJoin(
          Order,
          'order',
          'order.refer_id = sponsor.id AND order.type = :orderType',
          { orderType: OrderType.SPONSOR },
        )
        .andWhere('order.status = :paidStatus', {
          paidStatus: OrderStatus.PAID,
        })
        .andWhere('sponsor.activity_id = :activityId', {
          activityId: activity.id,
        })
        .orderBy(
          `CASE sponsor.tier
             WHEN 'premium' THEN 1
             WHEN 'main' THEN 2
             WHEN 'supporter' THEN 3
             ELSE 4
           END`,
          'ASC',
        )
        .addOrderBy('sponsor.created_at', 'ASC')
        .getMany(),
    ]);
    return {
      ...activity,
      price_range,
      tags,
      sponsor_packages,
      sponsors: sponsors.map((s) => ({
        id: s.id,
        brand_display_name: s.brand_display_name,
        tier: s.tier,
        amount: Number(s.amount),
        logo_url: s.logo_url ?? null,
        link_slug: (s.link_slug || s.sponsor_no).trim(),
        socials: this.parseSponsorSocialLinks(s.social_links_json),
      })),
      live_embeds: parseActivityLiveEmbedsJson(activity.live_embeds_json),
      competition_dashboard:
        await this.competitionDashboardService.getPayload(activity.id),
      onsite_cash: getOnsiteCashStatus(activity),
    };
  }

  /**
   * คืนรายการโหนดลูกสุด (leaf) ของ activity_package สำหรับงานนี้
   * ใช้เป็น "คลาส" ให้ผู้สมัครเลือกในฟอร์มสมัคร
   */
  async getLeafClassesForSlug(slug: string): Promise<ActivityLeafClass[]> {
    const activity = await this.findOneBySlug(slug);
    if (!activity.activity_package_id) {
      return [];
    }

    const tree = await this.activityPackageService.findTree();

    function findNode(nodes: AptNode[], id: number): AptNode | null {
      for (const node of nodes) {
        if (node.id === id) return node;
        const found = findNode(node.children, id);
        if (found) return found;
      }
      return null;
    }

    function collectLeaf(node: AptNode, prefix: string): ActivityLeafClass[] {
      const path = prefix ? `${prefix} / ${node.name}` : node.name;
      if (!node.children.length) {
        const price =
          node.price != null && !Number.isNaN(Number(node.price))
            ? Number(node.price)
            : 0;
        return [
          {
            id: node.id,
            name: node.name,
            full_path: path,
            price,
            slug: node.slug ?? null,
          },
        ];
      }
      return node.children.flatMap((child) => collectLeaf(child, path));
    }

    const root = findNode(tree, activity.activity_package_id);
    if (!root) return [];
    return collectLeaf(root, '');
  }

  async create(dto: CreateActivityDto): Promise<Activity> {
    const startDate = new Date(dto.date);
    const endDate = dto.end_date ? new Date(dto.end_date) : startDate;
    const cover_image = this.uploadService.requireUploadPath(
      dto.image_url,
      UPLOAD_SUBDIR,
      'รูปหน้าปก',
    );
    const banner_image = this.uploadService.requireUploadPath(
      dto.banner_image_url,
      UPLOAD_SUBDIR,
      'รูปแบนเนอร์',
    );
    if (!cover_image) {
      throw new BadRequestException('กรุณาอัปโหลดรูปหน้าปกของกิจกรรม');
    }

    const entity = this.activityRepository.create({
      organizer_id: dto.organizer_id ?? null,
      title: dto.title,
      slug: dto.slug ?? (slugify(dto.title) || `activity-${Date.now()}`),
      cover_image,
      banner_image,
      description: dto.description ?? null,
      live_embeds_json: serializeActivityLiveEmbeds(
        dto.live_embeds?.map((e) => ({
          title: e.title,
          platform: e.platform as ActivityLiveEmbed['platform'],
          embed_url: e.embed_url,
        })),
      ),
      detail_infographic_url: dto.detail_infographic_url ?? null,
      start_date: startDate,
      end_date: endDate,
      start_time: dto.start_time ?? '00:00:00',
      end_time: dto.end_time ?? '23:59:59',
      registration_open_at: dto.registration_open_at
        ? new Date(dto.registration_open_at)
        : null,
      registration_deadline: dto.registration_deadline
        ? new Date(dto.registration_deadline)
        : null,
      location_name: dto.location,
      location_address: dto.location_address ?? null,
      location_google_maps_url: dto.location_google_maps_url ?? null,
      location_latitude: dto.location_latitude ?? null,
      location_longitude: dto.location_longitude ?? null,
      check_in_geofence_enabled: dto.check_in_geofence_enabled ?? false,
      check_in_geofence_radius_m: dto.check_in_geofence_radius_m ?? 200,
      allow_onsite_cash: dto.allow_onsite_cash ?? false,
      onsite_cash_open_at: dto.onsite_cash_open_at
        ? new Date(dto.onsite_cash_open_at)
        : null,
      onsite_cash_close_at: dto.onsite_cash_close_at
        ? new Date(dto.onsite_cash_close_at)
        : null,
      allow_onsite_registration_after_deadline:
        dto.allow_onsite_registration_after_deadline ?? true,
      contact_info: dto.contact_info ?? null,
      province_id: dto.province_id ?? null,
      activity_package_id: dto.activity_package_id ?? null,
      max_participants: dto.max_participants ?? 0,
      status: dto.status,
    });
    const saved = await this.activityRepository.save(entity);
    if (dto.tags) {
      await this.activityTagService.setTagsForActivity(saved.id, dto.tags);
    }
    return saved;
  }

  async update(id: number, dto: UpdateActivityDto): Promise<Activity> {
    const existing = await this.findOne(id);
    const updates: Partial<Activity> = {};

    if (dto.title !== undefined) updates.title = dto.title;
    if (dto.slug !== undefined) updates.slug = dto.slug;
    if (dto.description !== undefined) updates.description = dto.description;
    if (dto.location !== undefined) updates.location_name = dto.location;
    if (dto.location_address !== undefined) {
      updates.location_address = dto.location_address ?? null;
    }
    if (dto.location_google_maps_url !== undefined) {
      updates.location_google_maps_url = dto.location_google_maps_url ?? null;
    }
    if (dto.location_latitude !== undefined) {
      updates.location_latitude = dto.location_latitude ?? null;
    }
    if (dto.location_longitude !== undefined) {
      updates.location_longitude = dto.location_longitude ?? null;
    }
    if (dto.check_in_geofence_enabled !== undefined) {
      updates.check_in_geofence_enabled = dto.check_in_geofence_enabled;
    }
    if (dto.check_in_geofence_radius_m !== undefined) {
      updates.check_in_geofence_radius_m = dto.check_in_geofence_radius_m;
    }
    if (dto.allow_onsite_cash !== undefined) {
      updates.allow_onsite_cash = dto.allow_onsite_cash;
    }
    if (dto.onsite_cash_open_at !== undefined) {
      updates.onsite_cash_open_at = dto.onsite_cash_open_at
        ? new Date(dto.onsite_cash_open_at)
        : null;
    }
    if (dto.onsite_cash_close_at !== undefined) {
      updates.onsite_cash_close_at = dto.onsite_cash_close_at
        ? new Date(dto.onsite_cash_close_at)
        : null;
    }
    if (dto.allow_onsite_registration_after_deadline !== undefined) {
      updates.allow_onsite_registration_after_deadline =
        dto.allow_onsite_registration_after_deadline;
    }
    if (dto.contact_info !== undefined) {
      updates.contact_info = dto.contact_info ?? null;
    }
    if (dto.province_id !== undefined) {
      updates.province_id = dto.province_id ?? null;
    }
    if (dto.organizer_id !== undefined) {
      updates.organizer_id = dto.organizer_id ?? null;
    }
    if (dto.activity_package_id !== undefined) {
      updates.activity_package_id = dto.activity_package_id ?? null;
    }
    if (dto.max_participants !== undefined) {
      updates.max_participants = dto.max_participants;
    }
    if (dto.image_url !== undefined) {
      const next = this.uploadService.requireUploadPath(
        dto.image_url,
        UPLOAD_SUBDIR,
        'รูปหน้าปก',
      );
      if (existing.cover_image && existing.cover_image !== next) {
        await this.uploadService.deleteByPath(existing.cover_image, {
          subdir: UPLOAD_SUBDIR,
        });
      }
      updates.cover_image = next;
    }
    if (dto.banner_image_url !== undefined) {
      const next = this.uploadService.requireUploadPath(
        dto.banner_image_url,
        UPLOAD_SUBDIR,
        'รูปแบนเนอร์',
      );
      if (existing.banner_image && existing.banner_image !== next) {
        await this.uploadService.deleteByPath(existing.banner_image, {
          subdir: UPLOAD_SUBDIR,
        });
      }
      updates.banner_image = next;
    }
    if (dto.detail_infographic_url !== undefined) {
      if (
        existing.detail_infographic_url &&
        existing.detail_infographic_url !== dto.detail_infographic_url
      ) {
        await this.uploadService.deleteByPath(existing.detail_infographic_url, {
          subdir: UPLOAD_SUBDIR,
        });
      }
      updates.detail_infographic_url = dto.detail_infographic_url || null;
    }
    if (dto.status !== undefined) {
      updates.status = dto.status;
    }
    if (dto.registration_open_at !== undefined) {
      updates.registration_open_at = dto.registration_open_at
        ? new Date(dto.registration_open_at)
        : null;
    }
    if (dto.registration_deadline !== undefined) {
      updates.registration_deadline = dto.registration_deadline
        ? new Date(dto.registration_deadline)
        : null;
    }
    if (dto.date !== undefined) {
      updates.start_date = new Date(dto.date);
    }
    if (dto.end_date !== undefined) {
      updates.end_date = new Date(dto.end_date);
    }
    if (dto.start_time !== undefined) updates.start_time = dto.start_time;
    if (dto.end_time !== undefined) updates.end_time = dto.end_time;
    if (dto.live_embeds !== undefined) {
      updates.live_embeds_json = serializeActivityLiveEmbeds(
        dto.live_embeds.map((e) => ({
          title: e.title,
          platform: e.platform as ActivityLiveEmbed['platform'],
          embed_url: e.embed_url,
        })),
      );
    }

    const merged = this.activityRepository.merge(existing, updates);
    const saved = await this.activityRepository.save(merged);

    if (dto.competition_dashboard !== undefined) {
      await this.competitionDashboardService.replaceFromPayload(
        saved.id,
        dto.competition_dashboard === null
          ? null
          : (dto.competition_dashboard as CompetitionDashboardPayload),
      );
    }

    if (dto.tags) {
      await this.activityTagService.setTagsForActivity(saved.id, dto.tags);
    }
    return this.findOne(saved.id);
  }

  async softDelete(id: number): Promise<void> {
    const existing = await this.findOne(id);
    await this.uploadService.deleteByPath(existing.cover_image, {
      subdir: UPLOAD_SUBDIR,
    });
    await this.uploadService.deleteByPath(existing.banner_image, {
      subdir: UPLOAD_SUBDIR,
    });
    await this.uploadService.deleteByPath(existing.detail_infographic_url, {
      subdir: UPLOAD_SUBDIR,
    });
    existing.deleted_at = new Date();
    await this.activityRepository.save(existing);
  }

  private parseSponsorSocialLinks(
    json: string | null,
  ): { type: string; label: string; url: string }[] {
    if (!json) return [];
    try {
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .slice(0, 8)
        .map((v: { type?: string; label?: string; url?: string }) => ({
          type: String(v.type || '').trim(),
          label: String(v.label || '').trim(),
          url: String(v.url || '').trim(),
        }))
        .filter((v) => v.type && v.label && v.url);
    } catch {
      return [];
    }
  }
}
