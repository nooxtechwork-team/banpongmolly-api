import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, MoreThanOrEqual, Repository } from 'typeorm';
import { Order, OrderStatus, OrderType } from '../entities/order.entity';
import { generateReferenceNo } from '../common/utils/reference-no.util';
import { ActivityRegistration } from '../entities/activity-registration.entity';
import { Activity } from '../entities/activity.entity';
import { SponsorRegistration, SponsorTier } from '../entities/sponsor.entity';
import { User } from '../entities/user.entity';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(ActivityRegistration)
    private readonly registrationRepository: Repository<ActivityRegistration>,
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    @InjectRepository(SponsorRegistration)
    private readonly sponsorRepository: Repository<SponsorRegistration>,
  ) {}

  async createActivityRegistrationOrder(params: {
    registrationId: number;
    applicantName: string;
    phone: string;
    email?: string | null;
    totalAmount: number;
  }): Promise<Order> {
    const entity = this.orderRepository.create({
      order_no: generateReferenceNo('ORD'),
      type: OrderType.ACTIVITY_REGISTRATION,
      refer_id: params.registrationId,
      customer_name: params.applicantName,
      customer_phone: params.phone,
      customer_email: params.email ?? null,
      total_amount: params.totalAmount,
      status: OrderStatus.PENDING,
      payment_ref: null,
    });
    return this.orderRepository.save(entity);
  }

  async createSponsorOrder(params: {
    sponsorId: number;
    contactName: string;
    phone: string;
    email?: string | null;
    totalAmount: number;
  }): Promise<Order> {
    const entity = this.orderRepository.create({
      order_no: generateReferenceNo('ORD'),
      type: OrderType.SPONSOR,
      refer_id: params.sponsorId,
      customer_name: params.contactName,
      customer_phone: params.phone,
      customer_email: params.email ?? null,
      total_amount: params.totalAmount,
      status: OrderStatus.PENDING,
      payment_ref: null,
    });
    return this.orderRepository.save(entity);
  }

  async syncSponsorOrder(sponsor: SponsorRegistration): Promise<void> {
    const order = await this.orderRepository.findOne({
      where: { type: OrderType.SPONSOR, refer_id: sponsor.id },
    });
    if (!order) return;
    order.customer_name = sponsor.contact_name;
    order.customer_phone = sponsor.contact_phone;
    order.customer_email = sponsor.contact_email ?? null;
    order.total_amount = sponsor.amount;
    await this.orderRepository.save(order);
  }

  async deleteSponsorOrders(sponsorId: number): Promise<void> {
    await this.orderRepository.delete({
      type: OrderType.SPONSOR,
      refer_id: sponsorId,
    });
  }

  /**
   * คืนรายการคำสั่งซื้อของผู้ใช้ปัจจุบัน (ใช้ email/phone ผูกกับ order)
   */
  async findMyOrders(
    user: User,
    options?: {
      page?: number;
      limit?: number;
      status?: OrderStatus;
      type?: OrderType;
      search?: string;
    },
  ): Promise<{
    items: (Order & {
      activity_title?: string | null;
      registration_no?: string | null;
      checked_in_at?: string | null;
    })[];
    total: number;
  }> {
    const page = options?.page && options.page > 0 ? options.page : 1;
    const limitRaw = options?.limit && options.limit > 0 ? options.limit : 10;
    const limit = Math.min(Math.max(1, limitRaw), 100);

    const qb = this.orderRepository.createQueryBuilder('order');

    // เงื่อนไขเจ้าของ order: (email ตรง หรือ ไม่มี email แต่เบอร์ตรง) — ใส่ bracket เพื่อให้ AND status/type ใช้กับทั้งก้อน
    qb.where(
      new Brackets((sub) => {
        sub.where('order.customer_email = :email', {
          email: user.email.toLowerCase(),
        });
        if (user.phone_number) {
          sub.orWhere(
            '(order.customer_email IS NULL AND order.customer_phone = :phone)',
            { phone: user.phone_number },
          );
        }
      }),
    );

    if (options?.status) {
      qb.andWhere('order.status = :status', { status: options.status });
    }

    if (options?.type) {
      qb.andWhere('order.type = :type', { type: options.type });
    }

    if (options?.search) {
      const q = `%${options.search.trim()}%`;
      qb.andWhere(
        '(order.order_no LIKE :q OR CAST(order.total_amount AS CHAR) LIKE :q)',
        { q },
      );
    }

    qb.orderBy('order.created_at', 'DESC');

    const [items, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    if (!items.length) {
      return { items, total };
    }

    const activityRegIds = items
      .filter((o) => o.type === OrderType.ACTIVITY_REGISTRATION)
      .map((o) => o.refer_id);
    const sponsorIds = items
      .filter((o) => o.type === OrderType.SPONSOR)
      .map((o) => o.refer_id);

    const [registrations, sponsors] = await Promise.all([
      activityRegIds.length
        ? this.registrationRepository.find({
            where: { id: In(activityRegIds) },
          })
        : Promise.resolve([]),
      sponsorIds.length
        ? this.sponsorRepository.find({
            where: { id: In(sponsorIds) },
          })
        : Promise.resolve([]),
    ]);

    const activityIds = new Set<number>();
    for (const reg of registrations) {
      activityIds.add(reg.activity_id);
    }
    for (const s of sponsors) {
      activityIds.add(s.activity_id);
    }

    const activities = activityIds.size
      ? await this.activityRepository.find({
          where: { id: In(Array.from(activityIds)) },
        })
      : [];

    const regById = new Map<number, ActivityRegistration>();
    for (const reg of registrations) {
      regById.set(reg.id, reg);
    }
    const sponsorById = new Map<number, SponsorRegistration>();
    for (const s of sponsors) {
      sponsorById.set(s.id, s);
    }
    const activityById = new Map<number, Activity>();
    for (const act of activities) {
      activityById.set(act.id, act);
    }

    const enriched = items.map((o) => {
      let title: string | null = null;
      let registrationNo: string | null = null;
      let checkedInAt: string | null = null;
      if (o.type === OrderType.ACTIVITY_REGISTRATION) {
        const reg = regById.get(o.refer_id);
        if (reg) {
          title = activityById.get(reg.activity_id)?.title ?? null;
          registrationNo = reg.registration_no ?? null;
          checkedInAt = reg.checked_in_at
            ? reg.checked_in_at.toISOString()
            : null;
        }
      } else if (o.type === OrderType.SPONSOR) {
        const sponsor = sponsorById.get(o.refer_id);
        if (sponsor) {
          title = activityById.get(sponsor.activity_id)?.title ?? null;
        }
      }
      return Object.assign(o, {
        activity_title: title,
        registration_no: registrationNo ?? undefined,
        checked_in_at: checkedInAt,
      });
    });

    return { items: enriched, total };
  }

  /**
   * คืนรายละเอียดคำสั่งซื้อของผู้ใช้ปัจจุบัน โดยค้นหาจาก order_no
   * พร้อมแนบข้อมูลใบสมัครและงานประกวด (ถ้ามี)
   */
  async findMyOrderDetail(
    user: User,
    orderNo: string,
  ): Promise<{
    order: Order;
    registration: ActivityRegistration | null;
    sponsor: SponsorRegistration | null;
    activity: Activity | null;
    entries: {
      package_id: number;
      quantity: number;
      unit_price: number;
      line_total: number;
    }[];
  }> {
    const order = await this.orderRepository.findOne({
      where: { order_no: orderNo },
    });

    if (!order) {
      throw new NotFoundException('ไม่พบคำสั่งซื้อ');
    }

    // ตรวจสอบความเป็นเจ้าของ: ใช้ email เป็นหลัก ถ้าไม่มีให้ใช้เบอร์โทร
    const emailMatches =
      order.customer_email &&
      order.customer_email.toLowerCase() === user.email.toLowerCase();
    const phoneMatches =
      !order.customer_email &&
      !!user.phone_number &&
      order.customer_phone === user.phone_number;

    if (!emailMatches && !phoneMatches) {
      throw new NotFoundException('ไม่พบคำสั่งซื้อ');
    }

    let registration: ActivityRegistration | null = null;
    let sponsor: SponsorRegistration | null = null;
    let activity: Activity | null = null;
    let entries: {
      package_id: number;
      quantity: number;
      unit_price: number;
      line_total: number;
    }[] = [];

    if (order.type === OrderType.ACTIVITY_REGISTRATION) {
      registration = await this.registrationRepository.findOne({
        where: { id: order.refer_id },
      });

      if (registration) {
        try {
          const parsed = JSON.parse(registration.entries_json);
          if (Array.isArray(parsed)) {
            entries = parsed.map((e) => ({
              package_id: Number(e.package_id),
              quantity: Number(e.quantity),
              unit_price: Number(e.unit_price),
              line_total: Number(e.line_total),
            }));
          }
        } catch {
          entries = [];
        }

        activity = await this.activityRepository.findOne({
          where: { id: registration.activity_id },
        });
      }
    } else if (order.type === OrderType.SPONSOR) {
      sponsor = await this.sponsorRepository.findOne({
        where: { id: order.refer_id },
      });

      if (sponsor) {
        activity = await this.activityRepository.findOne({
          where: { id: sponsor.activity_id },
        });
      }
    }

    return {
      order,
      registration,
      sponsor,
      activity,
      entries,
    };
  }

  // ADMIN: list payments (activity registration orders) with pagination
  async findAdminPayments(
    page: number = 1,
    limit: number = 10,
    options?: {
      status?: OrderStatus | 'all';
      search?: string;
    },
  ): Promise<{
    items: {
      order_id: number;
      order_no: string;
      applicant_name: string;
      activity_title: string;
      entries_summary: string;
      total_amount: number;
      status: OrderStatus;
      created_at: string;
    }[];
    total: number;
  }> {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const safePage = Math.max(1, page);

    const baseQb = this.orderRepository
      .createQueryBuilder('order')
      .innerJoin(ActivityRegistration, 'reg', 'reg.id = order.refer_id')
      .innerJoin(Activity, 'act', 'act.id = reg.activity_id')
      .where('order.type = :type', {
        type: OrderType.ACTIVITY_REGISTRATION,
      });

    if (options?.status && options.status !== 'all') {
      baseQb.andWhere('order.status = :status', {
        status: options.status,
      });
    }

    if (options?.search?.trim()) {
      const q = `%${options.search.trim()}%`;
      baseQb.andWhere(
        '(order.order_no LIKE :q OR reg.applicant_name LIKE :q OR act.title LIKE :q)',
        { q },
      );
    }

    const countQb = baseQb.clone();
    const total = await countQb.getCount();

    const raws = await baseQb
      .select([
        'order.id AS order_id',
        'order.order_no AS order_no',
        'order.status AS status',
        'order.total_amount AS total_amount',
        'order.created_at AS created_at',
        'reg.applicant_name AS applicant_name',
        'reg.entries_json AS entries_json',
        'act.title AS activity_title',
      ])
      .orderBy('order.created_at', 'DESC')
      .offset((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .getRawMany();

    const items = (raws || []).map((r: any) => {
      let entries_summary = '—';
      try {
        const entries = JSON.parse(r.entries_json || '[]');
        if (Array.isArray(entries) && entries.length > 0) {
          const totalQty = entries.reduce(
            (s: number, e: any) => s + (Number(e.quantity) || 0),
            0,
          );
          entries_summary = `${totalQty} รายการ`;
        }
      } catch {
        // keep default
      }
      return {
        order_id: Number(r.order_id),
        order_no: r.order_no as string,
        applicant_name: r.applicant_name as string,
        activity_title: r.activity_title as string,
        entries_summary,
        total_amount: Number(r.total_amount) || 0,
        status: r.status as OrderStatus,
        created_at: new Date(r.created_at).toISOString(),
      };
    });

    return { items, total };
  }

  // ADMIN: get single payment (order) detail for modal – order, registration (with payment_slip), activity, entries
  async findAdminPaymentDetail(orderId: number): Promise<{
    order: {
      id: number;
      order_no: string;
      status: OrderStatus;
      total_amount: number;
      created_at: string;
    };
    registration: {
      id: number;
      applicant_name: string;
      payment_slip: string | null;
      entries_json: string;
    } | null;
    activity: { id: number; title: string } | null;
    entries: {
      package_id: number;
      quantity: number;
      unit_price: number;
      line_total: number;
    }[];
  }> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId, type: OrderType.ACTIVITY_REGISTRATION },
    });
    if (!order) {
      throw new NotFoundException('ไม่พบคำสั่งซื้อ');
    }

    let registration: ActivityRegistration | null = null;
    let activity: Activity | null = null;
    let entries: {
      package_id: number;
      quantity: number;
      unit_price: number;
      line_total: number;
    }[] = [];

    registration = await this.registrationRepository.findOne({
      where: { id: order.refer_id },
    });
    if (registration) {
      try {
        const parsed = JSON.parse(registration.entries_json);
        if (Array.isArray(parsed)) {
          entries = parsed.map((e: any) => ({
            package_id: Number(e.package_id),
            quantity: Number(e.quantity),
            unit_price: Number(e.unit_price),
            line_total: Number(e.line_total),
          }));
        }
      } catch {
        entries = [];
      }
      activity = await this.activityRepository.findOne({
        where: { id: registration.activity_id },
      });
    }

    return {
      order: {
        id: order.id,
        order_no: order.order_no,
        status: order.status,
        total_amount: Number(order.total_amount),
        created_at: new Date(order.created_at).toISOString(),
      },
      registration: registration
        ? {
            id: registration.id,
            applicant_name: registration.applicant_name,
            payment_slip: registration.payment_slip,
            entries_json: registration.entries_json,
          }
        : null,
      activity: activity ? { id: activity.id, title: activity.title } : null,
      entries,
    };
  }

  // ADMIN: list sponsor payments with pagination
  async findAdminSponsorPayments(
    page: number = 1,
    limit: number = 10,
    options?: {
      status?: OrderStatus | 'all';
      search?: string;
    },
  ): Promise<{
    items: {
      order_id: number;
      order_no: string;
      sponsor_name: string;
      contact_name: string;
      activity_title: string;
      total_amount: number;
      status: OrderStatus;
      created_at: string;
    }[];
    total: number;
  }> {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const safePage = Math.max(1, page);

    const baseQb = this.orderRepository
      .createQueryBuilder('order')
      .innerJoin(SponsorRegistration, 'sponsor', 'sponsor.id = order.refer_id')
      .innerJoin(Activity, 'act', 'act.id = sponsor.activity_id')
      .where('order.type = :type', {
        type: OrderType.SPONSOR,
      });

    if (options?.status && options.status !== 'all') {
      baseQb.andWhere('order.status = :status', {
        status: options.status,
      });
    }

    if (options?.search?.trim()) {
      const q = `%${options.search.trim()}%`;
      baseQb.andWhere(
        '(order.order_no LIKE :q OR sponsor.brand_display_name LIKE :q OR sponsor.contact_name LIKE :q OR act.title LIKE :q)',
        { q },
      );
    }

    const countQb = baseQb.clone();
    const total = await countQb.getCount();

    const raws = await baseQb
      .select([
        'order.id AS order_id',
        'order.order_no AS order_no',
        'order.status AS status',
        'order.total_amount AS total_amount',
        'order.created_at AS created_at',
        'sponsor.brand_display_name AS sponsor_name',
        'sponsor.contact_name AS contact_name',
        'act.title AS activity_title',
      ])
      .orderBy('order.created_at', 'DESC')
      .offset((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .getRawMany();

    const items = (raws || []).map((r: any) => ({
      order_id: Number(r.order_id),
      order_no: r.order_no as string,
      sponsor_name: r.sponsor_name as string,
      contact_name: r.contact_name as string,
      activity_title: r.activity_title as string,
      total_amount: Number(r.total_amount) || 0,
      status: r.status as OrderStatus,
      created_at: new Date(r.created_at).toISOString(),
    }));

    return { items, total };
  }

  // ADMIN: get single sponsor payment detail – order, sponsor (with payment_slip), activity
  async findAdminSponsorPaymentDetail(orderId: number): Promise<{
    order: {
      id: number;
      order_no: string;
      status: OrderStatus;
      total_amount: number;
      created_at: string;
    };
    sponsor: {
      id: number;
      sponsor_no: string;
      brand_display_name: string;
      contact_name: string;
      contact_phone: string;
      contact_email: string | null;
      tier: SponsorTier;
      amount: number;
      payment_slip: string | null;
    } | null;
    activity: { id: number; title: string } | null;
  }> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId, type: OrderType.SPONSOR },
    });
    if (!order) {
      throw new NotFoundException('ไม่พบคำสั่งซื้อ');
    }

    let sponsor: SponsorRegistration | null = null;
    let activity: Activity | null = null;

    sponsor = await this.sponsorRepository.findOne({
      where: { id: order.refer_id },
    });
    if (sponsor) {
      activity = await this.activityRepository.findOne({
        where: { id: sponsor.activity_id },
      });
    }

    return {
      order: {
        id: order.id,
        order_no: order.order_no,
        status: order.status,
        total_amount: Number(order.total_amount),
        created_at: new Date(order.created_at).toISOString(),
      },
      sponsor: sponsor
        ? {
            id: sponsor.id,
            sponsor_no: sponsor.sponsor_no,
            brand_display_name: sponsor.brand_display_name,
            contact_name: sponsor.contact_name,
            contact_phone: sponsor.contact_phone,
            contact_email: sponsor.contact_email,
            tier: sponsor.tier,
            amount: Number(sponsor.amount),
            payment_slip: sponsor.payment_slip,
          }
        : null,
      activity: activity ? { id: activity.id, title: activity.title } : null,
    };
  }

  // ADMIN: update payment status (approve / reject)
  async updateStatusAdmin(
    orderId: number,
    status: OrderStatus,
  ): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException('ไม่พบคำสั่งซื้อ');
    }
    order.status = status;
    return this.orderRepository.save(order);
  }

  async findSponsorOrderBySponsorId(
    sponsorId: number,
  ): Promise<Order | null> {
    return this.orderRepository.findOne({
      where: { type: OrderType.SPONSOR, refer_id: sponsorId },
    });
  }

  // ADMIN: summary cards for payments page
  async getAdminPaymentsSummary(): Promise<{
    pending: number;
    approved_today: number;
    rejected_today: number;
  }> {
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

    const [pending, approvedToday, rejectedToday] = await Promise.all([
      this.orderRepository.count({
        where: {
          type: OrderType.ACTIVITY_REGISTRATION,
          status: OrderStatus.PENDING,
        },
      }),
      this.orderRepository
        .createQueryBuilder('order')
        .where('order.type = :type', {
          type: OrderType.ACTIVITY_REGISTRATION,
        })
        .andWhere('order.status = :status', {
          status: OrderStatus.PAID,
        })
        .andWhere('order.updated_at BETWEEN :start AND :end', {
          start: todayStart,
          end: todayEnd,
        })
        .getCount(),
      this.orderRepository
        .createQueryBuilder('order')
        .where('order.type = :type', {
          type: OrderType.ACTIVITY_REGISTRATION,
        })
        .andWhere('order.status = :status', {
          status: OrderStatus.CANCELLED,
        })
        .andWhere('order.updated_at BETWEEN :start AND :end', {
          start: todayStart,
          end: todayEnd,
        })
        .getCount(),
    ]);

    return {
      pending,
      approved_today: approvedToday,
      rejected_today: rejectedToday,
    };
  }

  // ADMIN: summary cards for sponsor payments page
  async getAdminSponsorPaymentsSummary(): Promise<{
    pending: number;
    approved_today: number;
    rejected_today: number;
  }> {
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

    const [pending, approvedToday, rejectedToday] = await Promise.all([
      this.orderRepository.count({
        where: {
          type: OrderType.SPONSOR,
          status: OrderStatus.PENDING,
        },
      }),
      this.orderRepository
        .createQueryBuilder('order')
        .where('order.type = :type', {
          type: OrderType.SPONSOR,
        })
        .andWhere('order.status = :status', {
          status: OrderStatus.PAID,
        })
        .andWhere('order.updated_at BETWEEN :start AND :end', {
          start: todayStart,
          end: todayEnd,
        })
        .getCount(),
      this.orderRepository
        .createQueryBuilder('order')
        .where('order.type = :type', {
          type: OrderType.SPONSOR,
        })
        .andWhere('order.status = :status', {
          status: OrderStatus.CANCELLED,
        })
        .andWhere('order.updated_at BETWEEN :start AND :end', {
          start: todayStart,
          end: todayEnd,
        })
        .getCount(),
    ]);

    return {
      pending,
      approved_today: approvedToday,
      rejected_today: rejectedToday,
    };
  }

  // ADMIN: overview metrics + charts for dashboard page
  async getAdminDashboardMetrics(): Promise<{
    kpis: {
      total_applicants: number;
      total_revenue: number;
      pending_payments: number;
    };
    applicantsByActivity: { label: string; value: number }[];
    weeklyRevenue: { label: string; value: number }[];
  }> {
    const [totalApplicants, revenueAgg, pendingPayments] = await Promise.all([
      this.registrationRepository.count(),
      this.orderRepository
        .createQueryBuilder('order')
        .select('SUM(order.total_amount)', 'total')
        .where('order.status = :status', { status: OrderStatus.PAID })
        .getRawOne<{ total: string | null }>(),
      this.orderRepository.count({
        where: { status: OrderStatus.PENDING },
      }),
    ]);

    const totalRevenue = revenueAgg?.total ? Number(revenueAgg.total) : 0;

    // Top activities by number of registrations (limit 6)
    const activityRows = await this.registrationRepository
      .createQueryBuilder('reg')
      .innerJoin(Activity, 'act', 'act.id = reg.activity_id')
      .select('act.title', 'label')
      .addSelect('COUNT(reg.id)', 'value')
      .groupBy('act.id')
      .orderBy('value', 'DESC')
      .limit(6)
      .getRawMany<{ label: string; value: string }>();

    const applicantsByActivity = activityRows.map((r) => ({
      label: r.label,
      value: Number(r.value) || 0,
    }));

    // Revenue for last 7 days (including today)
    const now = new Date();
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 6,
    );

    const recentPaidOrders = await this.orderRepository.find({
      where: {
        status: OrderStatus.PAID,
        created_at: MoreThanOrEqual(start),
      },
      order: { created_at: 'ASC' },
    });

    const dayKeys: string[] = [];
    const revenueByDay = new Map<string, number>();
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + i,
      );
      const key = d.toISOString().slice(0, 10);
      dayKeys.push(key);
      revenueByDay.set(key, 0);
    }

    for (const order of recentPaidOrders) {
      const key = order.created_at.toISOString().slice(0, 10);
      if (!revenueByDay.has(key)) continue;
      revenueByDay.set(
        key,
        (revenueByDay.get(key) || 0) + Number(order.total_amount),
      );
    }

    const formatter = new Intl.DateTimeFormat('th-TH', {
      day: '2-digit',
      month: 'short',
    });

    const weeklyRevenue = dayKeys.map((key) => {
      const date = new Date(key);
      return {
        label: formatter.format(date),
        value: revenueByDay.get(key) || 0,
      };
    });

    return {
      kpis: {
        total_applicants: totalApplicants,
        total_revenue: totalRevenue,
        pending_payments: pendingPayments,
      },
      applicantsByActivity,
      weeklyRevenue,
    };
  }
}
