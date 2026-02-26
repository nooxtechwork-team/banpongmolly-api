import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus, OrderType } from '../entities/order.entity';
import { ActivityRegistration } from '../entities/activity-registration.entity';
import { Activity } from '../entities/activity.entity';

export interface ApplicantListItem {
  id: number;
  registration_no: string;
  applicant_name: string;
  activity_id: number;
  activity_title: string;
  entries_summary: string;
  total_amount: number;
  order_id: number;
  order_no: string;
  payment_status: OrderStatus;
  created_at: string;
}

@Injectable()
export class ApplicantsService {
  constructor(
    @InjectRepository(ActivityRegistration)
    private readonly registrationRepository: Repository<ActivityRegistration>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
  ) {}

  async findPaginated(
    page: number = 1,
    limit: number = 10,
    options?: {
      activity_id?: number;
      status?: OrderStatus;
      search?: string;
    },
  ): Promise<{ items: ApplicantListItem[]; total: number }> {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const safePage = Math.max(1, page);

    const qb = this.registrationRepository
      .createQueryBuilder('reg')
      .innerJoin(Order, 'o', 'o.refer_id = reg.id AND o.type = :otype', {
        otype: OrderType.ACTIVITY_REGISTRATION,
      })
      .innerJoin(Activity, 'a', 'a.id = reg.activity_id')
      .select([
        'reg.id',
        'reg.registration_no',
        'reg.applicant_name',
        'reg.activity_id',
        'reg.entries_json',
        'reg.total_amount',
        'reg.created_at',
      ])
      .addSelect('o.id', 'order_id')
      .addSelect('o.order_no', 'order_no')
      .addSelect('o.status', 'payment_status')
      .addSelect('a.title', 'activity_title')
      .orderBy('reg.created_at', 'DESC');

    if (options?.activity_id != null) {
      qb.andWhere('reg.activity_id = :activity_id', {
        activity_id: options.activity_id,
      });
    }

    if (options?.status) {
      qb.andWhere('o.status = :status', { status: options.status });
    }

    if (options?.search?.trim()) {
      const q = `%${options.search.trim()}%`;
      qb.andWhere(
        '(reg.applicant_name LIKE :q OR reg.registration_no LIKE :q OR reg.phone LIKE :q OR reg.email LIKE :q OR o.order_no LIKE :q)',
        { q },
      );
    }

    const raws = await qb
      .offset((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .getRawMany();

    const countQb = this.registrationRepository
      .createQueryBuilder('reg')
      .innerJoin(Order, 'o', 'o.refer_id = reg.id AND o.type = :otype', {
        otype: OrderType.ACTIVITY_REGISTRATION,
      })
      .innerJoin(Activity, 'a', 'a.id = reg.activity_id');

    if (options?.activity_id != null) {
      countQb.andWhere('reg.activity_id = :activity_id', {
        activity_id: options.activity_id,
      });
    }
    if (options?.status) {
      countQb.andWhere('o.status = :status', { status: options.status });
    }
    if (options?.search?.trim()) {
      const q = `%${options.search.trim()}%`;
      countQb.andWhere(
        '(reg.applicant_name LIKE :q OR reg.registration_no LIKE :q OR reg.phone LIKE :q OR reg.email LIKE :q OR o.order_no LIKE :q)',
        { q },
      );
    }

    const totalCount = await countQb.getCount();

    const items: ApplicantListItem[] = (raws || []).map((r: any) => {
      let entries_summary = '—';
      try {
        const entries = JSON.parse(r.reg_entries_json || '[]');
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
        id: r.reg_id,
        registration_no: r.reg_registration_no ?? '',
        applicant_name: r.reg_applicant_name ?? '',
        activity_id: r.reg_activity_id,
        activity_title: r.activity_title ?? '',
        entries_summary,
        total_amount: Number(r.reg_total_amount) || 0,
        order_id: r.order_id,
        order_no: r.order_no ?? '',
        payment_status:
          (r.payment_status as OrderStatus) || OrderStatus.PENDING,
        created_at: r.reg_created_at
          ? new Date(r.reg_created_at).toISOString()
          : '',
      };
    });

    return { items, total: totalCount };
  }
}
