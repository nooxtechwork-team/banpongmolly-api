import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus, OrderType } from '../entities/order.entity';
import { generateReferenceNo } from '../common/utils/reference-no.util';
import { ActivityRegistration } from '../entities/activity-registration.entity';
import { Activity } from '../entities/activity.entity';
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
  ): Promise<{ items: Order[]; total: number }> {
    const page = options?.page && options.page > 0 ? options.page : 1;
    const limitRaw = options?.limit && options.limit > 0 ? options.limit : 10;
    const limit = Math.min(Math.max(1, limitRaw), 100);

    const qb = this.orderRepository
      .createQueryBuilder('order')
      .where('order.customer_email = :email', {
        email: user.email.toLowerCase(),
      });

    // fallback ถ้าเก็บแค่เบอร์โทร (แต่ user ไม่มี email ใน order)
    if (user.phone_number) {
      qb.orWhere(
        '(order.customer_email IS NULL AND order.customer_phone = :phone)',
        {
          phone: user.phone_number,
        },
      );
    }

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

    return { items, total };
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
    }

    return {
      order,
      registration,
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
        .andWhere('order.created_at BETWEEN :start AND :end', {
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
        .andWhere('order.created_at BETWEEN :start AND :end', {
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
}
