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
}
