import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThanOrEqual, Repository } from 'typeorm';
import { Order, OrderStatus, OrderType } from '../entities/order.entity';
import { generateReferenceNo } from '../common/utils/reference-no.util';
import { ActivityRegistration } from '../entities/activity-registration.entity';
import { Activity } from '../entities/activity.entity';
import { SponsorRegistration, SponsorTier } from '../entities/sponsor.entity';
import { User } from '../entities/user.entity';
import { ActivityPackage } from '../entities/activity-package.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { MailService } from '../mail/mail.service';
import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { buildActivityRegistrationEntryCode } from '../common/utils/activity-registration-entry-code.util';

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
    @InjectRepository(ActivityPackage)
    private readonly activityPackageRepository: Repository<ActivityPackage>,
    private readonly auditLogService: AuditLogService,
    private readonly mailService: MailService,
  ) {}

  private async loadPackageSlugPathFromLayer2ByLeafIds(
    leafIds: number[],
  ): Promise<Map<number, string>> {
    const out = new Map<number, string>();
    if (!leafIds.length) return out;
    const unique = [...new Set(leafIds)];
    const visited = new Map<number, ActivityPackage>();
    let frontier = unique;

    while (frontier.length) {
      const rows = await this.activityPackageRepository.find({
        where: { id: In(frontier), deleted_at: IsNull() },
      });
      const next: number[] = [];
      for (const row of rows) {
        if (visited.has(row.id)) continue;
        visited.set(row.id, row);
        if (row.parent_id != null && !visited.has(row.parent_id)) {
          next.push(row.parent_id);
        }
      }
      frontier = [...new Set(next)];
    }

    for (const leafId of unique) {
      const path: string[] = [];
      let cur = visited.get(leafId);
      while (cur) {
        path.push(cur.slug);
        if (cur.parent_id == null) break;
        cur = visited.get(cur.parent_id);
      }
      if (!path.length) continue;
      const topToLeaf = path.reverse();
      const fromLayer2 = topToLeaf.slice(1).filter(Boolean);
      const slugPath = (fromLayer2.length ? fromLayer2 : topToLeaf).join('-');
      out.set(leafId, slugPath);
    }

    return out;
  }

  private async loadPackageNamePathByLeafIds(
    leafIds: number[],
  ): Promise<Map<number, string>> {
    const out = new Map<number, string>();
    if (!leafIds.length) return out;
    const unique = [...new Set(leafIds)];
    const visited = new Map<number, ActivityPackage>();
    let frontier = unique;

    while (frontier.length) {
      const rows = await this.activityPackageRepository.find({
        where: { id: In(frontier), deleted_at: IsNull() },
      });
      const next: number[] = [];
      for (const row of rows) {
        if (visited.has(row.id)) continue;
        visited.set(row.id, row);
        if (row.parent_id != null && !visited.has(row.parent_id)) {
          next.push(row.parent_id);
        }
      }
      frontier = [...new Set(next)];
    }

    for (const leafId of unique) {
      const path: string[] = [];
      let cur = visited.get(leafId);
      while (cur) {
        path.push(cur.name);
        if (cur.parent_id == null) break;
        cur = visited.get(cur.parent_id);
      }
      if (!path.length) continue;
      out.set(leafId, path.reverse().join(' / '));
    }

    return out;
  }

  async createActivityRegistrationOrder(params: {
    registrationId: number;
    applicantName: string;
    phone: string;
    email?: string | null;
    totalAmount: number;
    userId?: number | null;
  }): Promise<Order> {
    const entity = this.orderRepository.create({
      order_no: generateReferenceNo('ORD'),
      type: OrderType.ACTIVITY_REGISTRATION,
      refer_id: params.registrationId,
      user_id: params.userId ?? null,
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
    userId?: number | null;
  }): Promise<Order> {
    const entity = this.orderRepository.create({
      order_no: generateReferenceNo('ORD'),
      type: OrderType.SPONSOR,
      refer_id: params.sponsorId,
      user_id: params.userId ?? null,
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

    const qb = this.orderRepository
      .createQueryBuilder('order')
      .where('order.user_id = :userId', { userId: user.id });

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
        cancel_reason: o.cancel_reason ?? null,
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
    status?: OrderStatus | null,
  ): Promise<{
    order: Order;
    registration: ActivityRegistration | null;
    sponsor: SponsorRegistration | null;
    activity: Activity | null;
    entries: {
      index?: string;
      entry_code?: string;
      package_id: number;
      package_name: string;
      quantity: number;
      unit_price: number;
      line_total: number;
    }[];
  }> {
    // Only filter by `status` when it's explicitly provided.
    const where: {
      order_no: string;
      user_id: number;
      status?: OrderStatus;
    } = {
      order_no: orderNo,
      user_id: user.id,
    };

    if (status !== undefined && status !== null) {
      where.status = status;
    }

    const order = await this.orderRepository.findOne({ where });

    if (!order) {
      throw new NotFoundException('ไม่พบคำสั่งซื้อ');
    }

    if (order.user_id !== user.id) {
      throw new NotFoundException('ไม่พบคำสั่งซื้อ');
    }

    let registration: ActivityRegistration | null = null;
    let sponsor: SponsorRegistration | null = null;
    let activity: Activity | null = null;
    let entries: {
      index?: string;
      entry_code?: string;
      package_id: number;
      package_name: string;
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
            const packageIds = parsed
              .map((e: any) => Number(e.package_id))
              .filter((id: number) => !Number.isNaN(id));

            const packages = packageIds.length
              ? await this.activityPackageRepository.find({
                  where: { id: In(packageIds) },
                })
              : [];

            const packageNameById = new Map<number, string>(
              (packages || []).map((p) => [p.id, p.name]),
            );
            const packagePathById =
              await this.loadPackageNamePathByLeafIds(packageIds);

            const slugPaths =
              await this.loadPackageSlugPathFromLayer2ByLeafIds(packageIds);

            entries = parsed.map((e: any) => {
              const packageId = Number(e.package_id);
              const packageName =
                packagePathById.get(packageId) ??
                packageNameById.get(packageId) ??
                `ค่าสมัครแพ็กเกจ #${packageId}`;
              const idxRaw = e.index;
              const idxStr =
                idxRaw !== undefined && idxRaw !== null && idxRaw !== ''
                  ? String(idxRaw)
                  : '';
              const slugPath = slugPaths.get(packageId);
              const entry_code =
                slugPath
                  ? buildActivityRegistrationEntryCode(slugPath, idxStr || '0000')
                  : e.entry_code != null && String(e.entry_code).trim() !== ''
                    ? String(e.entry_code).trim()
                    : undefined;
              return {
                ...(idxStr ? { index: idxStr } : {}),
                ...(entry_code ? { entry_code } : {}),
                package_id: packageId,
                package_name: packageName,
                quantity: Number(e.quantity),
                unit_price: Number(e.unit_price),
                line_total: Number(e.line_total),
              };
            });
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
      avatar_url: string | null;
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
      .leftJoin(User, 'user', 'user.id = reg.user_id')
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
        'user.avatar_url AS avatar_url',
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
        avatar_url: (r.avatar_url as string | null) ?? null,
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
      cancel_reason: string | null;
    };
    registration: {
      id: number;
      applicant_name: string;
      payment_slip: string | null;
      entries_json: string;
    } | null;
    activity: { id: number; title: string } | null;
    entries: {
      index?: string;
      entry_code?: string;
      package_id: number;
      package_name: string;
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
      index?: string;
      entry_code?: string;
      package_id: number;
      package_name: string;
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
          const packageIds = parsed
            .map((e: any) => Number(e.package_id))
            .filter((id: number) => !Number.isNaN(id));

          const packages = packageIds.length
            ? await this.activityPackageRepository.find({
                where: { id: In(packageIds) },
              })
            : [];

          const packageNameById = new Map<number, string>(
            (packages || []).map((p) => [p.id, p.name]),
          );
          const packagePathById =
            await this.loadPackageNamePathByLeafIds(packageIds);

          const slugPaths =
            await this.loadPackageSlugPathFromLayer2ByLeafIds(packageIds);

          entries = parsed.map((e: any) => {
            const packageId = Number(e.package_id);
            const packageName =
              packagePathById.get(packageId) ??
              packageNameById.get(packageId) ??
              `ค่าสมัครแพ็กเกจ #${packageId}`;
            const idxRaw = e.index;
            const idxStr =
              idxRaw !== undefined && idxRaw !== null && idxRaw !== ''
                ? String(idxRaw)
                : '';
            const slugPath = slugPaths.get(packageId);
            const entry_code =
              slugPath
                ? buildActivityRegistrationEntryCode(slugPath, idxStr || '0000')
                : e.entry_code != null && String(e.entry_code).trim() !== ''
                  ? String(e.entry_code).trim()
                  : undefined;
            return {
              ...(idxStr ? { index: idxStr } : {}),
              ...(entry_code ? { entry_code } : {}),
              package_id: packageId,
              package_name: packageName,
              quantity: Number(e.quantity),
              unit_price: Number(e.unit_price),
              line_total: Number(e.line_total),
            };
          });
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
        cancel_reason: order.cancel_reason ?? null,
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
      logo_url: string | null;
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
        'sponsor.logo_url AS logo_url',
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
      logo_url: (r.logo_url as string | null) ?? null,
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
      cancel_reason: string | null;
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
        cancel_reason: order.cancel_reason ?? null,
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
    cancelReason?: string | null,
  ): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException('ไม่พบคำสั่งซื้อ');
    }
    order.status = status;
    order.cancel_reason =
      status === OrderStatus.CANCELLED && cancelReason ? cancelReason : null;

    // ถ้าเป็นออเดอร์สปอนเซอร์ และอนุมัติการชำระเงินแล้ว ให้เปิดแสดงบนหน้าแรกอัตโนมัติ
    if (order.type === OrderType.SPONSOR && status === OrderStatus.PAID) {
      const sponsor = await this.sponsorRepository.findOne({
        where: { id: order.refer_id },
      });
      if (sponsor && !sponsor.is_featured_homepage) {
        sponsor.is_featured_homepage = true;
        await this.sponsorRepository.save(sponsor);
      }
    }

    const saved = await this.orderRepository.save(order);

    // หลังจากนี้สามารถเรียก sendReceiptEmail(order.id) เพื่อส่งใบเสร็จให้ลูกค้า (ใช้ใน endpoint แยก)
    return saved;
  }

  /**
   * สร้างไฟล์ PDF ใบเสร็จรับเงินจาก HTML template ด้วย Puppeteer
   * ใช้ได้ทั้งฝั่ง admin และฝั่งผู้ใช้ (my orders)
   */
  async generateReceiptPdf(orderId: number): Promise<Uint8Array> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException('ไม่พบคำสั่งซื้อ');
    }

    const isActivity = order.type === OrderType.ACTIVITY_REGISTRATION;

    let activityTitle = '';
    let customerName = order.customer_name;
    let lines: { label: string; amount: number }[] = [];

    if (isActivity) {
      const detail = await this.findAdminPaymentDetail(orderId);
      activityTitle = detail.activity?.title ?? '';
      customerName = detail.registration?.applicant_name ?? order.customer_name;
      lines =
        detail.entries?.map((e) => {
          const displayName = e.package_name?.toString().trim() || '';
          const base = displayName
            ? displayName
            : `ค่าสมัครแพ็กเกจ #${e.package_id}`;
          const code =
            e.entry_code != null && String(e.entry_code).trim() !== ''
              ? String(e.entry_code).trim()
              : e.index !== undefined && e.index !== null && String(e.index) !== ''
                ? String(e.index)
                : '';
          const prefix = code ? `[${code}] ` : '';
          return {
            label: `${prefix}${base}`,
            amount: e.line_total,
          };
        }) ?? [];
    } else if (order.type === OrderType.SPONSOR) {
      const detail = await this.findAdminSponsorPaymentDetail(orderId);
      activityTitle = detail.activity?.title ?? '';
      customerName = detail.sponsor?.brand_display_name ?? order.customer_name;
      if (detail.sponsor) {
        lines = [
          {
            label: `สปอนเซอร์แพ็กเกจ ${detail.sponsor.tier}`,
            amount: detail.sponsor.amount,
          },
        ];
      }
    }

    const formatAmount = (n: number) =>
      Number(n || 0).toLocaleString('th-TH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    // รองรับทั้งตอนรันจาก dist และจาก src (dev mode)
    let templatePath = path.join(__dirname, 'templates', 'receipt.html');
    if (!fs.existsSync(templatePath)) {
      templatePath = path.join(
        process.cwd(),
        'src',
        'order',
        'templates',
        'receipt.html',
      );
    }
    let html = fs.readFileSync(templatePath, 'utf8');

    const linesHtml = lines.length
      ? lines
          .map(
            (l) =>
              `<tr><td>${l.label}</td><td style="text-align:right;">${formatAmount(
                l.amount,
              )}</td></tr>`,
          )
          .join('')
      : `<tr><td>ยอดชำระทั้งหมด</td><td style="text-align:right;">${formatAmount(
          Number(order.total_amount),
        )}</td></tr>`;

    html = html
      .replace(/{{order_no}}/g, order.order_no)
      .replace(
        /{{date}}/g,
        order.created_at.toLocaleString('th-TH', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
      )
      .replace(/{{customer_name}}/g, customerName)
      .replace(/{{activity_title}}/g, activityTitle || '')
      .replace(/{{total_amount}}/g, formatAmount(Number(order.total_amount)))
      .replace(/{{lines}}/g, linesHtml);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        preferCSSPageSize: true,
        printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
      });
      return pdfBuffer;
    } finally {
      await browser.close();
    }
  }

  /**
   * ส่งอีเมลใบเสร็จพร้อมแนบไฟล์ PDF ไปยังอีเมลของผู้ที่ทำรายการสั่งซื้อ
   */
  async sendReceiptEmail(orderId: number): Promise<void> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException('ไม่พบคำสั่งซื้อ');
    }
    if (!order.customer_email) {
      // ไม่มีอีเมลให้ส่ง ข้าม
      return;
    }

    const pdfUint8 = await this.generateReceiptPdf(orderId);
    const pdfBuffer = Buffer.from(pdfUint8);

    const formattedTotal = Number(order.total_amount).toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    // โหลด HTML email template (รองรับทั้ง dist และ src)
    let emailTemplatePath = path.join(
      __dirname,
      'templates',
      'receipt-email.html',
    );
    if (!fs.existsSync(emailTemplatePath)) {
      emailTemplatePath = path.join(
        process.cwd(),
        'src',
        'order',
        'templates',
        'receipt-email.html',
      );
    }
    let emailHtml = fs.readFileSync(emailTemplatePath, 'utf8');
    emailHtml = emailHtml
      .replace(/{{order_no}}/g, order.order_no)
      .replace(/{{total_amount}}/g, formattedTotal);

    // ใช้ MailService โดยแนบไฟล์ PDF เป็นใบเสร็จ
    // ถ้า Mail ไม่ได้ config ไว้ MailService จะ log warning และไม่ throw
    await this.mailService.sendRawEmail({
      to: order.customer_email,
      subject: `ใบเสร็จรับเงินสำหรับคำสั่งซื้อ ${order.order_no}`,
      text: `แนบใบเสร็จรับเงินสำหรับคำสั่งซื้อหมายเลข ${order.order_no} ยอดชำระ ${formattedTotal} บาท`,
      html: emailHtml,
      attachments: [
        {
          filename: `receipt-${order.order_no}.pdf`,
          content: pdfBuffer,
        },
      ],
    });
  }

  async findSponsorOrderBySponsorId(sponsorId: number): Promise<Order | null> {
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
