import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { SponsorRegistration, SponsorTier } from '../entities/sponsor.entity';
import { Activity } from '../entities/activity.entity';
import { generateReferenceNo } from '../common/utils/reference-no.util';
import { OrderService } from '../order/order.service';

export interface SponsorListItem {
  id: number;
  sponsor_no: string;
  brand_display_name: string;
  tier: SponsorTier;
  amount: number;
  activity_id: number;
  activity_title: string | null;
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

    const saved = await this.sponsorRepo.save(sponsor);
    await this.orderService.syncSponsorOrder(saved);
    return saved;
  }

  async deleteAdmin(id: number): Promise<void> {
    const sponsor = await this.findOneAdmin(id);
    await this.orderService.deleteSponsorOrders(id);
    await this.sponsorRepo.remove(sponsor);
  }

  async createFromSubmission(payload: {
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
  }): Promise<{
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
    });

    const saved = await this.sponsorRepo.save(sponsor);

    // สร้าง Order ผูกกับการสมัครสปอนเซอร์นี้
    const order = await this.orderService.createSponsorOrder({
      sponsorId: saved.id,
      contactName: saved.contact_name,
      phone: saved.contact_phone,
      email: saved.contact_email,
      totalAmount: Number(saved.amount),
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
}
