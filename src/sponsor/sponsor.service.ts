import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import {
  SponsorRegistration,
  SponsorStatus,
  SponsorTier,
} from '../entities/sponsor.entity';
import { Activity } from '../entities/activity.entity';
import { generateReferenceNo } from '../common/utils/reference-no.util';

export interface SponsorListItem {
  id: number;
  sponsor_no: string;
  brand_display_name: string;
  tier: SponsorTier;
  amount: number;
  activity_id: number;
  activity_title: string | null;
  status: SponsorStatus;
  created_at: string;
}
export interface SponsorListOptions {
  page?: number;
  limit?: number;
  search?: string;
  tier?: SponsorTier | 'all';
  activity_id?: number;
  status?: SponsorStatus | 'all';
}

@Injectable()
export class SponsorService {
  constructor(
    @InjectRepository(SponsorRegistration)
    private readonly sponsorRepo: Repository<SponsorRegistration>,
    @InjectRepository(Activity)
    private readonly activityRepo: Repository<Activity>,
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

    if (options.status && options.status !== 'all') {
      qb.andWhere('sponsor.status = :status', { status: options.status });
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
      status: s.status,
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
  }): Promise<SponsorRegistration> {
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
      status: 'pending_payment_review',
    });
    return this.sponsorRepo.save(sponsor);
  }

  async updateStatus(
    id: number,
    status: SponsorStatus,
  ): Promise<SponsorRegistration> {
    const sponsor = await this.findOneAdmin(id);
    sponsor.status = status;
    return this.sponsorRepo.save(sponsor);
  }
}
