import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SponsorRegistration, SponsorTier } from '../entities/sponsor.entity';
import { Activity } from '../entities/activity.entity';
import { Order, OrderStatus, OrderType } from '../entities/order.entity';
import { generateReferenceNo } from '../common/utils/reference-no.util';
import { OrderService } from '../order/order.service';
import { UserActionLogService } from '../user-action-log/user-action-log.service';

/** จำนวนลิงก์สูงสุดใน LinkTree ของสปอนเซอร์ */
export const MAX_SPONSOR_LINKS = 8;

export type SponsorSocialLink = { type: string; label: string; url: string };

export interface SponsorListItem {
  id: number;
  sponsor_no: string;
  brand_display_name: string;
  tier: SponsorTier;
  amount: number;
  activity_id: number;
  activity_title: string | null;
  logo_url: string | null;
  link_slug: string | null;
  is_featured_homepage: boolean;
  created_at: string;
}

export interface SponsorPublicLinkTree {
  id: number;
  link_slug: string;
  brand_display_name: string;
  tier: SponsorTier;
  logo_url: string | null;
  activity_title: string | null;
  socials: SponsorSocialLink[];
}

export interface SponsorHomepageItem {
  id: number;
  brand_display_name: string;
  tier: SponsorTier;
  amount: number;
  logo_url: string | null;
  activity_title: string | null;
  link_slug: string;
  socials: SponsorSocialLink[];
}

function slugifySponsor(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
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
      .innerJoin(
        Order,
        'order',
        'order.refer_id = sponsor.id AND order.type = :orderType',
        { orderType: OrderType.SPONSOR },
      )
      .andWhere('order.status = :paidStatus', { paidStatus: OrderStatus.PAID });

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
        ? await this.activityRepo.findBy({ id: In(activityIds) })
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
      logo_url: s.logo_url ?? null,
      link_slug: this.publicLinkSlug(s),
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
    socials?: SponsorSocialLink[] | null;
    link_slug?: string | null;
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
      socials?: SponsorSocialLink[] | null;
      link_slug?: string | null;
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
      sponsor.social_links_json = this.serializeSocialLinks(payload.socials);
    }
    if (payload.link_slug !== undefined) {
      const next = payload.link_slug?.trim()
        ? await this.ensureUniqueLinkSlug(payload.link_slug, id)
        : await this.ensureUniqueLinkSlug(
            sponsor.brand_display_name || sponsor.sponsor_no,
            id,
          );
      sponsor.link_slug = next;
    } else if (!sponsor.link_slug) {
      sponsor.link_slug = await this.ensureUniqueLinkSlug(
        sponsor.brand_display_name || sponsor.sponsor_no,
        id,
      );
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
      socials?: SponsorSocialLink[] | null;
      link_slug?: string | null;
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
    const sponsorNo = generateReferenceNo('SP');
    const linkSlug = await this.ensureUniqueLinkSlug(
      payload.link_slug?.trim() ||
        payload.brand_display_name ||
        sponsorNo,
    );

    const sponsor = this.sponsorRepo.create({
      sponsor_no: sponsorNo,
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
      social_links_json: this.serializeSocialLinks(payload.socials),
      link_slug: linkSlug,
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
        link_slug: saved.link_slug,
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
   * หน้า LinkTree สาธารณะ — เฉพาะสปอนเซอร์ที่ชำระแล้ว
   * หาได้จาก link_slug หรือ sponsor_no
   */
  async findPublicLinkTree(slug: string): Promise<SponsorPublicLinkTree> {
    const key = slug.trim();
    if (!key) {
      throw new NotFoundException('ไม่พบหน้าผู้สนับสนุน');
    }

    const qb = this.paidSponsorsQueryBuilder(false)
      .andWhere(
        '(sponsor.link_slug = :key OR LOWER(sponsor.sponsor_no) = :keyLower)',
        { key, keyLower: key.toLowerCase() },
      )
      .orderBy('sponsor.amount', 'DESC')
      .addOrderBy('sponsor.created_at', 'DESC');

    const sponsor = await qb.getOne();
    if (!sponsor) {
      throw new NotFoundException('ไม่พบหน้าผู้สนับสนุน');
    }

    if (!sponsor.link_slug) {
      sponsor.link_slug = await this.ensureUniqueLinkSlug(
        sponsor.brand_display_name || sponsor.sponsor_no,
        sponsor.id,
      );
      await this.sponsorRepo.save(sponsor);
    }

    const activity = await this.activityRepo.findOne({
      where: { id: sponsor.activity_id },
    });

    return {
      id: sponsor.id,
      link_slug: this.publicLinkSlug(sponsor),
      brand_display_name: sponsor.brand_display_name,
      tier: sponsor.tier,
      logo_url: sponsor.logo_url ?? null,
      activity_title: activity?.title ?? null,
      socials: this.parseSocialLinks(sponsor.social_links_json),
    };
  }

  /**
   * สปอนเซอร์ที่ชำระเงินแล้ว (ใช้กับหน้าแรก / รายการ public)
   */
  private paidSponsorsQueryBuilder(featuredOnly = false) {
    const qb = this.sponsorRepo
      .createQueryBuilder('sponsor')
      .innerJoin(
        Order,
        'order',
        'order.refer_id = sponsor.id AND order.type = :orderType',
        { orderType: OrderType.SPONSOR },
      )
      .andWhere('order.status = :paidStatus', { paidStatus: OrderStatus.PAID });

    if (featuredOnly) {
      qb.andWhere('sponsor.is_featured_homepage = :featured', { featured: true });
    }

    return qb;
  }

  /**
   * รายการสปอนเซอร์ที่ให้แสดงบนหน้าแรก
   * เลือกจาก sponsor_registrations ที่ is_featured_homepage = true และชำระเงินแล้ว
   */
  async listFeaturedForHomepage(): Promise<SponsorHomepageItem[]> {
    const sponsors = await this.paidSponsorsQueryBuilder(true)
      .orderBy('sponsor.created_at', 'DESC')
      .getMany();

    if (!sponsors.length) return [];

    await this.ensureLinkSlugs(sponsors);

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

    return sponsors.map((s) => ({
      id: s.id,
      brand_display_name: s.brand_display_name,
      tier: s.tier,
      amount: Number(s.amount),
      logo_url: s.logo_url,
      activity_title: activityMap.get(s.activity_id)?.title ?? null,
      link_slug: this.publicLinkSlug(s),
      socials: this.parseSocialLinks(s.social_links_json),
    }));
  }

  /**
   * สปอนเซอร์โดยรวมสำหรับหน้าแรก — รวมทุกแบรนด์ (ไม่ซ้ำชื่อ) ที่ชำระเงินแล้ว
   */
  async listAllForHomepage(limit = 48): Promise<SponsorHomepageItem[]> {
    const sponsors = await this.paidSponsorsQueryBuilder(false)
      .orderBy('sponsor.amount', 'DESC')
      .addOrderBy('sponsor.created_at', 'DESC')
      .getMany();

    if (!sponsors.length) return [];

    const tierRank: Record<string, number> = {
      premium: 3,
      main: 2,
      supporter: 1,
    };

    const uniqueByBrand = new Map<string, SponsorRegistration>();
    for (const sponsor of sponsors) {
      const key = sponsor.brand_display_name.trim().toLowerCase();
      const existing = uniqueByBrand.get(key);
      if (!existing) {
        uniqueByBrand.set(key, sponsor);
        continue;
      }
      const sponsorScore = (tierRank[sponsor.tier] ?? 0) * 1_000_000 + Number(sponsor.amount);
      const existingScore = (tierRank[existing.tier] ?? 0) * 1_000_000 + Number(existing.amount);
      if (sponsorScore > existingScore) {
        uniqueByBrand.set(key, sponsor);
      }
    }

    const uniqueSponsors = Array.from(uniqueByBrand.values());
    await this.ensureLinkSlugs(uniqueSponsors);

    const activityIds = Array.from(
      new Set(
        uniqueSponsors
          .map((s) => s.activity_id)
          .filter(Boolean),
      ),
    );
    const activities = activityIds.length
      ? await this.activityRepo.find({ where: { id: In(activityIds) } })
      : [];
    const activityMap = new Map<number, Activity>();
    for (const act of activities) {
      activityMap.set(act.id, act);
    }

    const sorted = uniqueSponsors.sort((a, b) => {
      const scoreA = (tierRank[a.tier] ?? 0) * 1_000_000 + Number(a.amount);
      const scoreB = (tierRank[b.tier] ?? 0) * 1_000_000 + Number(b.amount);
      return scoreB - scoreA;
    });

    return sorted.slice(0, limit).map((s) => ({
      id: s.id,
      brand_display_name: s.brand_display_name,
      tier: s.tier,
      amount: Number(s.amount),
      logo_url: s.logo_url,
      activity_title: activityMap.get(s.activity_id)?.title ?? null,
      link_slug: this.publicLinkSlug(s),
      socials: this.parseSocialLinks(s.social_links_json),
    }));
  }

  /** slug ที่ใช้ใน URL สาธารณะ */
  publicLinkSlug(sponsor: Pick<SponsorRegistration, 'link_slug' | 'sponsor_no'>): string {
    return (sponsor.link_slug || sponsor.sponsor_no).trim();
  }

  private async ensureLinkSlugs(sponsors: SponsorRegistration[]): Promise<void> {
    const missing = sponsors.filter((s) => !s.link_slug?.trim());
    for (const sponsor of missing) {
      sponsor.link_slug = await this.ensureUniqueLinkSlug(
        sponsor.brand_display_name || sponsor.sponsor_no,
        sponsor.id,
      );
    }
    if (missing.length) {
      await this.sponsorRepo.save(missing);
    }
  }

  private async ensureUniqueLinkSlug(
    raw: string,
    excludeId?: number,
  ): Promise<string> {
    const base = slugifySponsor(raw) || 'sponsor';
    let candidate = base.slice(0, 100);
    let n = 2;
    while (n < 1000) {
      const existing = await this.sponsorRepo.findOne({
        where: { link_slug: candidate },
      });
      if (!existing || (excludeId != null && existing.id === excludeId)) {
        return candidate;
      }
      const suffix = `-${n++}`;
      candidate = `${base.slice(0, Math.max(1, 100 - suffix.length))}${suffix}`;
    }
    throw new BadRequestException('ไม่สามารถสร้างลิงก์สาธารณะได้');
  }

  private serializeSocialLinks(
    socials?: SponsorSocialLink[] | null,
  ): string | null {
    const cleaned = this.normalizeSocialLinks(socials);
    return cleaned.length ? JSON.stringify(cleaned) : null;
  }

  private normalizeSocialLinks(
    socials?: SponsorSocialLink[] | null,
  ): SponsorSocialLink[] {
    if (!socials?.length) return [];
    return socials
      .map((v) => ({
        type: String(v.type || '').trim(),
        label: String(v.label || '').trim(),
        url: String(v.url || '').trim(),
      }))
      .filter((v) => v.type && v.label && v.url)
      .slice(0, MAX_SPONSOR_LINKS);
  }

  private parseSocialLinks(json: string | null): SponsorSocialLink[] {
    if (!json) return [];
    try {
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) return [];
      return this.normalizeSocialLinks(parsed);
    } catch {
      return [];
    }
  }
}
