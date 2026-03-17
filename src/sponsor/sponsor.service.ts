import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { SponsorRegistration, SponsorTier } from '../entities/sponsor.entity';
import { Activity } from '../entities/activity.entity';
import { generateReferenceNo } from '../common/utils/reference-no.util';
import { OrderService } from '../order/order.service';
import { UserActionLogService } from '../user-action-log/user-action-log.service';

export interface SponsorListItem {
  id: number;
  sponsor_no: string;
  brand_display_name: string;
  tier: SponsorTier;
  amount: number;
  activity_id: number;
  activity_title: string | null;
  is_featured_homepage: boolean;
  created_at: string;
}
export interface SponsorListOptions {
  page?: number;
  limit?: number;
  search?: string;
  tier?: SponsorTier | 'all';
  activity_id?: number;
}

@Injectable()
export class SponsorService {
  constructor(
    @InjectRepository(SponsorRegistration)
    private readonly sponsorRepo: Repository<SponsorRegistration>,
    @InjectRepository(Activity)
    private readonly activityRepo: Repository<Activity>,
    private readonly orderService: OrderService,
    private readonly userActionLogService: UserActionLogService,
  ) {}

  async listAdmin(
    options: SponsorListOptions,
  ): Promise<{ items: SponsorListItem[]; total: number }> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 10));

    const qb = this.sponsorRepo
      .createQueryBuilder('sponsor')
      .leftJoin(Activity, 'act', 'act.id = sponsor.activity_id');

    if (options.search?.trim()) {
      const q = `%${options.search.trim()}%`;
      qb.andWhere(
        '(sponsor.sponsor_no LIKE :q OR sponsor.brand_display_name LIKE :q OR sponsor.contact_name LIKE :q)',
        { q },
      );
    }

    if (options.tier && options.tier !== 'all') {
      qb.andWhere('sponsor.tier = :tier', { tier: options.tier });
    }

    if (options.activity_id != null) {
      qb.andWhere('sponsor.activity_id = :activity_id', {
        activity_id: options.activity_id,
      });
    }

    qb.orderBy('sponsor.created_at', 'DESC');

    const [rows, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const activityIds = Array.from(
      new Set(rows.map((s) => s.activity_id).filter(Boolean)),
    );
    const activities =
      activityIds.length > 0
        ? await this.activityRepo.findBy({
            id: Like<any>(`${activityIds.join(',')}`) as any,
          })
        : [];

    const activityMap = new Map<number, Activity>();
    for (const act of activities) {
      activityMap.set(act.id, act);
    }

    const items: SponsorListItem[] = rows.map((s) => ({
      id: s.id,
      sponsor_no: s.sponsor_no,
      brand_display_name: s.brand_display_name,
      tier: s.tier,
      amount: Number(s.amount),
      activity_id: s.activity_id,
      activity_title: activityMap.get(s.activity_id)?.title ?? null,
      is_featured_homepage: s.is_featured_homepage,
      created_at: s.created_at.toISOString(),
    }));

    return { items, total };
  }

  async findOneAdmin(id: number): Promise<SponsorRegistration> {
    const sponsor = await this.sponsorRepo.findOne({ where: { id } });
    if (!sponsor) {
      throw new NotFoundException('ไม่พบข้อมูลสปอนเซอร์');
    }
    return sponsor;
  }

  async createAdmin(payload: {
    activity_id: number;
    tier: SponsorTier;
    amount: number;
    contact_name: string;
    contact_phone: string;
    contact_email?: string | null;
    contact_line_id?: string | null;
    brand_display_name: string;
    logo_url?: string | null;
    receipt_name?: string | null;
    receipt_address?: string | null;
    tax_id?: string | null;
    payment_slip?: string | null;
    socials?: { type: string; label: string; url: string }[] | null;
  }): Promise<SponsorRegistration> {
    const { sponsor } = await this.createFromSubmission(payload);
    return sponsor;
  }

  async updateAdmin(
    id: number,
    payload: Partial<{
      activity_id: number;
      tier: SponsorTier;
      amount: number;
      contact_name: string;
      contact_phone: string;
      contact_email?: string | null;
      contact_line_id?: string | null;
      brand_display_name: string;
      logo_url?: string | null;
      receipt_name?: string | null;
      receipt_address?: string | null;
      tax_id?: string | null;
      payment_slip?: string | null;
      socials?: { type: string; label: string; url: string }[] | null;
    }>,
  ): Promise<SponsorRegistration> {
    const sponsor = await this.findOneAdmin(id);

    if (payload.activity_id !== undefined) {
      sponsor.activity_id = payload.activity_id;
    }
    if (payload.tier !== undefined) {
      sponsor.tier = payload.tier;
    }
    if (payload.amount !== undefined) {
      sponsor.amount = payload.amount;
    }
    if (payload.contact_name !== undefined) {
      sponsor.contact_name = payload.contact_name;
    }
    if (payload.contact_phone !== undefined) {
      sponsor.contact_phone = payload.contact_phone;
    }
    if (payload.contact_email !== undefined) {
      sponsor.contact_email = payload.contact_email ?? null;
    }
    if (payload.contact_line_id !== undefined) {
      sponsor.contact_line_id = payload.contact_line_id ?? null;
    }
    if (payload.brand_display_name !== undefined) {
      sponsor.brand_display_name = payload.brand_display_name;
    }
    if (payload.logo_url !== undefined) {
      sponsor.logo_url = payload.logo_url ?? null;
    }
    if (payload.receipt_name !== undefined) {
      sponsor.receipt_name = payload.receipt_name ?? null;
    }
    if (payload.receipt_address !== undefined) {
      sponsor.receipt_address = payload.receipt_address ?? null;
    }
    if (payload.tax_id !== undefined) {
      sponsor.tax_id = payload.tax_id ?? null;
    }
    if (payload.payment_slip !== undefined) {
      sponsor.payment_slip = payload.payment_slip ?? null;
    }
    if (payload.socials !== undefined) {
      sponsor.social_links_json =
        payload.socials && payload.socials.length
          ? JSON.stringify(payload.socials.slice(0, 2))
          : null;
    }

    const saved = await this.sponsorRepo.save(sponsor);
    await this.orderService.syncSponsorOrder(saved);
    return saved;
  }

  /**
   * เปิด/ปิดการแสดงผลสปอนเซอร์บนหน้าแรก
   * อนุญาตให้เปิดได้เฉพาะกรณีที่คำสั่งซื้อถูกชำระแล้ว (status = paid)
   */
  async setHomepageFeatured(
    id: number,
    featured: boolean,
  ): Promise<SponsorRegistration> {
    const sponsor = await this.findOneAdmin(id);
    if (!featured) {
      sponsor.is_featured_homepage = false;
      return this.sponsorRepo.save(sponsor);
    }

    const order = await this.orderService.findSponsorOrderBySponsorId(
      sponsor.id,
    );
    if (!order || order.status !== 'paid') {
      throw new Error(
        'สามารถแสดงบนหน้าแรกได้เฉพาะสปอนเซอร์ที่ชำระเงินเรียบร้อยแล้วเท่านั้น',
      );
    }

    sponsor.is_featured_homepage = true;
    return this.sponsorRepo.save(sponsor);
  }

  async deleteAdmin(id: number): Promise<void> {
    const sponsor = await this.findOneAdmin(id);
    await this.orderService.deleteSponsorOrders(id);
    await this.sponsorRepo.remove(sponsor);
  }

  async createFromSubmission(
    payload: {
      activity_id: number;
      tier: SponsorTier;
      amount: number;
      contact_name: string;
      contact_phone: string;
      contact_email?: string | null;
      contact_line_id?: string | null;
      brand_display_name: string;
      logo_url?: string | null;
      receipt_name?: string | null;
      receipt_address?: string | null;
      tax_id?: string | null;
      payment_slip?: string | null;
      socials?: { type: string; label: string; url: string }[] | null;
    },
    userId?: number | null,
  ): Promise<{
    sponsor: SponsorRegistration;
    order: {
      id: number;
      order_no: string;
      total_amount: number;
      status: string;
    };
  }> {
    const sponsor = this.sponsorRepo.create({
      sponsor_no: generateReferenceNo('SP'),
      activity_id: payload.activity_id,
      user_id: userId ?? null,
      tier: payload.tier,
      amount: payload.amount,
      contact_name: payload.contact_name,
      contact_phone: payload.contact_phone,
      contact_email: payload.contact_email ?? null,
      contact_line_id: payload.contact_line_id ?? null,
      brand_display_name: payload.brand_display_name,
      logo_url: payload.logo_url ?? null,
      receipt_name: payload.receipt_name ?? null,
      receipt_address: payload.receipt_address ?? null,
      tax_id: payload.tax_id ?? null,
      payment_slip: payload.payment_slip ?? null,
      social_links_json:
        payload.socials && payload.socials.length
          ? JSON.stringify(payload.socials.slice(0, 2))
          : null,
    });

    const saved = await this.sponsorRepo.save(sponsor);

    // สร้าง Order ผูกกับการสมัครสปอนเซอร์นี้
    const order = await this.orderService.createSponsorOrder({
      sponsorId: saved.id,
      contactName: saved.contact_name,
      phone: saved.contact_phone,
      email: saved.contact_email,
      totalAmount: Number(saved.amount),
      userId: userId ?? null,
    });

    await this.userActionLogService.create({
      action: 'sponsor_apply',
      entity_type: 'sponsor_registration',
      user_id: userId ?? null,
      entity_id: saved.id,
      email: saved.contact_email ?? null,
      phone: saved.contact_phone ?? null,
      metadata: {
        activity_id: saved.activity_id,
        sponsor_no: saved.sponsor_no,
        amount: Number(saved.amount),
        tier: saved.tier,
        order_id: order.id,
        order_no: order.order_no,
      },
    });

    return {
      sponsor: saved,
      order: {
        id: order.id,
        order_no: order.order_no,
        total_amount: Number(order.total_amount),
        status: order.status,
      },
    };
  }

  /**
   * รายการสปอนเซอร์ที่ให้แสดงบนหน้าแรก
   * เลือกจาก sponsor_registrations ที่ is_featured_homepage = true
   */
  async listFeaturedForHomepage(): Promise<
    {
      id: number;
      brand_display_name: string;
      tier: SponsorTier;
      amount: number;
      logo_url: string | null;
      activity_title: string | null;
      socials: { type: string; label: string; url: string }[];
    }[]
  > {
    const sponsors = await this.sponsorRepo.find({
      where: { is_featured_homepage: true },
      order: { created_at: 'DESC' },
    });

    if (!sponsors.length) return [];

    const activityIds = Array.from(
      new Set(sponsors.map((s) => s.activity_id).filter(Boolean)),
    );
    const activities = activityIds.length
      ? await this.activityRepo.find({ where: { id: In(activityIds) } })
      : [];
    const activityMap = new Map<number, Activity>();
    for (const act of activities) {
      activityMap.set(act.id, act);
    }

    return sponsors.map((s) => {
      let socials: { type: string; label: string; url: string }[] = [];
      if (s.social_links_json) {
        try {
          const parsed = JSON.parse(s.social_links_json);
          if (Array.isArray(parsed)) {
            socials = parsed
              .slice(0, 2)
              .map((v: any) => ({
                type: String(v.type || '').trim(),
                label: String(v.label || '').trim(),
                url: String(v.url || '').trim(),
              }))
              .filter((v) => v.type && v.label && v.url);
          }
        } catch {
          socials = [];
        }
      }

      return {
        id: s.id,
        brand_display_name: s.brand_display_name,
        tier: s.tier,
        amount: Number(s.amount),
        logo_url: s.logo_url,
        activity_title: activityMap.get(s.activity_id)?.title ?? null,
        socials,
      };
    });
  }
}
