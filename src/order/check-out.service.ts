import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ActivityRegistration } from '../entities/activity-registration.entity';
import { Activity } from '../entities/activity.entity';
import { Order, OrderStatus, OrderType } from '../entities/order.entity';
import { ActivityPackage } from '../entities/activity-package.entity';
import { buildActivityRegistrationEntryCode } from '../common/utils/activity-registration-entry-code.util';
import { AuditLogService } from '../audit-log/audit-log.service';

type EntryJsonRow = {
  index?: string;
  entry_code?: string;
  package_id?: number;
  quantity?: number;
  unit_price?: number;
  line_total?: number;
  checked_out_at?: string | null;
  checked_out_by_user_id?: number | null;
  checked_out_by_name?: string | null;
  checkout_requested_at?: string | null;
  checkout_request_note?: string | null;
  checkout_request_email_sent_at?: string | null;
  checkout_remark?: string | null;
};

export interface CheckoutActivitySummary {
  activity_id: number;
  activity_title: string;
  total_items: number;
  checked_out_items: number;
  pending_items: number;
}

export interface CheckoutItemRow {
  registration_id: number;
  registration_no: string;
  order_id: number;
  order_no: string;
  /** ISO: เวลาสร้างคำสั่งซื้อ */
  order_created_at: string;
  applicant_name: string;
  applicant_email: string | null;
  farm_name: string | null;
  entry_index: string;
  entry_code: string;
  package_name: string;
  amount: number;
  checked_out: boolean;
  checked_out_at: string | null;
  checked_out_by_name: string | null;
  /** ผู้ใช้ขอให้ดำเนินการ checkout */
  checkout_requested_at: string | null;
  checkout_request_note: string | null;
  /** เวลาที่ส่งอีเมลแจ้งเจ้าหน้าที่ (สคริปต์ cron) สำเร็จ */
  checkout_request_email_sent_at: string | null;
  /** หมายเหตุจากแอดมินตอนยืนยัน checkout */
  checkout_remark: string | null;
}

/** รายการรหัสปลา (entry) สำหรับ autocomplete หน้า config competition dashboard */
export interface CompetitionEntryPicklistItem {
  entry_code: string;
  /** แสดงในเมนู เช่น "CODE · ผู้สมัคร · เลขที่ใบ" */
  label: string;
  fish_owner: string;
  /** มักเป็น farm_name */
  display_name: string | null;
  class_code: string;
  registration_no: string;
  package_name: string;
}

@Injectable()
export class CheckOutService {
  constructor(
    @InjectRepository(ActivityRegistration)
    private readonly registrationRepository: Repository<ActivityRegistration>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    @InjectRepository(ActivityPackage)
    private readonly activityPackageRepository: Repository<ActivityPackage>,
    private readonly auditLogService: AuditLogService,
  ) {}

  private parseEntries(raw: string): EntryJsonRow[] {
    try {
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async buildPackagePathMap(
    packageIds: number[],
  ): Promise<Map<number, string>> {
    const out = new Map<number, string>();
    if (!packageIds.length) return out;
    const unique = [...new Set(packageIds)];
    const visited = new Map<number, ActivityPackage>();
    let frontier = unique;

    while (frontier.length) {
      const rows = await this.activityPackageRepository.find({
        where: { id: In(frontier) },
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
      const names: string[] = [];
      let cur = visited.get(leafId);
      while (cur) {
        names.push(cur.name);
        if (cur.parent_id == null) break;
        cur = visited.get(cur.parent_id);
      }
      if (names.length) out.set(leafId, names.reverse().join(' / '));
    }
    return out;
  }

  private async buildPackageSlugPathFromLayer2Map(
    packageIds: number[],
  ): Promise<Map<number, string>> {
    const out = new Map<number, string>();
    if (!packageIds.length) return out;
    const unique = [...new Set(packageIds)];
    const visited = new Map<number, ActivityPackage>();
    let frontier = unique;

    while (frontier.length) {
      const rows = await this.activityPackageRepository.find({
        where: { id: In(frontier) },
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
      const slugs: string[] = [];
      let cur = visited.get(leafId);
      while (cur) {
        const slug = cur.slug?.trim();
        if (slug) slugs.push(slug);
        if (cur.parent_id == null) break;
        cur = visited.get(cur.parent_id);
      }
      if (!slugs.length) continue;
      const topToLeaf = slugs.reverse();
      out.set(leafId, topToLeaf.filter(Boolean).join(''));
    }
    return out;
  }

  async getActivitiesSummary(
    page: number = 1,
    limit: number = 20,
  ): Promise<{ items: CheckoutActivitySummary[]; total: number }> {
    const rows = await this.registrationRepository
      .createQueryBuilder('reg')
      .innerJoin(
        Order,
        'ord',
        'ord.refer_id = reg.id AND ord.type = :type AND ord.status = :status',
        { type: OrderType.ACTIVITY_REGISTRATION, status: OrderStatus.PAID },
      )
      .innerJoin(Activity, 'act', 'act.id = reg.activity_id')
      .where('reg.checked_in_at IS NOT NULL')
      .select([
        'reg.activity_id AS activity_id',
        'act.title AS activity_title',
        'reg.entries_json AS entries_json',
      ])
      .orderBy('act.title', 'ASC')
      .getRawMany();

    const map = new Map<number, CheckoutActivitySummary>();
    for (const r of rows) {
      const activityId = Number(r.activity_id);
      if (!map.has(activityId)) {
        map.set(activityId, {
          activity_id: activityId,
          activity_title: String(r.activity_title ?? ''),
          total_items: 0,
          checked_out_items: 0,
          pending_items: 0,
        });
      }
      const summary = map.get(activityId)!;
      const entries = this.parseEntries(String(r.entries_json ?? '[]'));
      for (const e of entries) {
        const qty = Math.max(1, Number(e.quantity) || 1);
        summary.total_items += qty;
        if (e.checked_out_at) summary.checked_out_items += qty;
      }
      summary.pending_items = Math.max(
        0,
        summary.total_items - summary.checked_out_items,
      );
    }
    const all = Array.from(map.values());
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const start = (safePage - 1) * safeLimit;
    return {
      items: all.slice(start, start + safeLimit),
      total: all.length,
    };
  }

  async getActivityItems(
    activityId: number,
    filters?: {
      status?: 'all' | 'checked_out' | 'pending' | 'requested';
      search?: string;
      farm_name?: string;
    },
  ): Promise<{
    activity: { id: number; title: string } | null;
    items: CheckoutItemRow[];
    totals: {
      total_items: number;
      checked_out_items: number;
      pending_items: number;
    };
  }> {
    const activity = await this.activityRepository.findOne({
      where: { id: activityId },
    });
    if (!activity) throw new NotFoundException('ไม่พบกิจกรรม');

    const rows = await this.registrationRepository
      .createQueryBuilder('reg')
      .innerJoin(
        Order,
        'ord',
        'ord.refer_id = reg.id AND ord.type = :type AND ord.status = :status',
        { type: OrderType.ACTIVITY_REGISTRATION, status: OrderStatus.PAID },
      )
      .where('reg.activity_id = :activityId', { activityId })
      .andWhere('reg.checked_in_at IS NOT NULL')
      .select([
        'reg.id AS registration_id',
        'reg.registration_no AS registration_no',
        'reg.applicant_name AS applicant_name',
        'reg.email AS applicant_email',
        'reg.farm_name AS farm_name',
        'reg.entries_json AS entries_json',
        'ord.id AS order_id',
        'ord.order_no AS order_no',
        'ord.created_at AS order_created_at',
      ])
      .orderBy('ord.created_at', 'DESC')
      .addOrderBy('reg.id', 'DESC')
      .getRawMany();

    const packageIds: number[] = [];
    for (const r of rows) {
      const entries = this.parseEntries(String(r.entries_json ?? '[]'));
      for (const e of entries) {
        const id = Number(e.package_id);
        if (!Number.isNaN(id)) packageIds.push(id);
      }
    }
    const packagePathMap = await this.buildPackagePathMap(packageIds);
    const packageSlugPathMap =
      await this.buildPackageSlugPathFromLayer2Map(packageIds);

    let items: CheckoutItemRow[] = [];
    for (const r of rows) {
      const registrationId = Number(r.registration_id);
      const orderId = Number(r.order_id);
      const orderCreatedRaw = r.order_created_at;
      const order_created_at =
        orderCreatedRaw instanceof Date
          ? orderCreatedRaw.toISOString()
          : orderCreatedRaw != null && String(orderCreatedRaw).trim() !== ''
            ? String(orderCreatedRaw)
            : '';
      const entries = this.parseEntries(String(r.entries_json ?? '[]'));
      items.push(
        ...entries.map((e) => {
          const packageId = Number(e.package_id);
          const idx =
            e.index != null && String(e.index).trim() !== ''
              ? String(e.index).trim()
              : '-';
          const code = buildActivityRegistrationEntryCode(
            packageSlugPathMap.get(packageId) ?? null,
            idx && idx !== '-' ? idx : '0000',
          );
          return {
            registration_id: registrationId,
            registration_no: String(r.registration_no ?? ''),
            order_id: orderId,
            order_no: String(r.order_no ?? ''),
            order_created_at,
            applicant_name: String(r.applicant_name ?? ''),
            applicant_email:
              r.applicant_email != null &&
              String(r.applicant_email).trim() !== ''
                ? String(r.applicant_email).trim()
                : null,
            farm_name: r.farm_name ? String(r.farm_name) : null,
            entry_index: idx,
            entry_code: code,
            package_name:
              packagePathMap.get(packageId) ||
              `แพ็กเกจ #${Number.isNaN(packageId) ? '-' : packageId}`,
            amount: Number(e.line_total) || 0,
            checked_out: !!e.checked_out_at,
            checked_out_at: e.checked_out_at ? String(e.checked_out_at) : null,
            checked_out_by_name:
              e.checked_out_by_name != null
                ? String(e.checked_out_by_name)
                : null,
            checkout_requested_at: e.checkout_requested_at
              ? String(e.checkout_requested_at)
              : null,
            checkout_request_note:
              e.checkout_request_note != null &&
              String(e.checkout_request_note).trim() !== ''
                ? String(e.checkout_request_note).trim()
                : null,
            checkout_request_email_sent_at: e.checkout_request_email_sent_at
              ? String(e.checkout_request_email_sent_at)
              : null,
            checkout_remark:
              e.checkout_remark != null &&
              String(e.checkout_remark).trim() !== ''
                ? String(e.checkout_remark).trim()
                : null,
          } satisfies CheckoutItemRow;
        }),
      );
    }

    const q = (filters?.search || '').trim().toLowerCase();
    if (q) {
      items = items.filter(
        (x) =>
          x.order_no.toLowerCase().includes(q) ||
          x.registration_no.toLowerCase().includes(q) ||
          x.applicant_name.toLowerCase().includes(q) ||
          (x.applicant_email || '').toLowerCase().includes(q) ||
          (x.farm_name || '').toLowerCase().includes(q) ||
          x.entry_code.toLowerCase().includes(q) ||
          x.package_name.toLowerCase().includes(q),
      );
    }
    if (filters?.farm_name?.trim()) {
      const farm = filters.farm_name.trim().toLowerCase();
      items = items.filter((x) =>
        (x.farm_name || '').toLowerCase().includes(farm),
      );
    }
    if (filters?.status === 'checked_out') {
      items = items.filter((x) => x.checked_out);
    } else if (filters?.status === 'pending') {
      items = items.filter((x) => !x.checked_out);
    } else if (filters?.status === 'requested') {
      items = items.filter((x) => !x.checked_out && !!x.checkout_requested_at);
    }

    const checkedOut = items.filter((x) => x.checked_out).length;
    return {
      activity: { id: activity.id, title: activity.title },
      items,
      totals: {
        total_items: items.length,
        checked_out_items: checkedOut,
        pending_items: Math.max(0, items.length - checkedOut),
      },
    };
  }

  /**
   * รายการ entry จากใบสมัครที่ชำระเงินแล้วของงานนี้ (ไม่ต้อง check-in)
   * ใช้เลือกรหัสปลาในแดชบอร์ดสรุปผล — ดึงชื่อผู้สมัคร / farm / แพ็กเกจตามแถวจริง
   */
  async listCompetitionEntryPicklist(
    activityId: number,
  ): Promise<{ items: CompetitionEntryPicklistItem[] }> {
    const activity = await this.activityRepository.findOne({
      where: { id: activityId },
    });
    if (!activity) throw new NotFoundException('ไม่พบกิจกรรม');

    const rows = await this.registrationRepository
      .createQueryBuilder('reg')
      .innerJoin(
        Order,
        'ord',
        'ord.refer_id = reg.id AND ord.type = :type AND ord.status = :status',
        { type: OrderType.ACTIVITY_REGISTRATION, status: OrderStatus.PAID },
      )
      .where('reg.activity_id = :activityId', { activityId })
      .select([
        'reg.id AS registration_id',
        'reg.registration_no AS registration_no',
        'reg.applicant_name AS applicant_name',
        'reg.farm_name AS farm_name',
        'reg.entries_json AS entries_json',
      ])
      .orderBy('ord.created_at', 'ASC')
      .addOrderBy('reg.id', 'ASC')
      .getRawMany();

    const packageIds: number[] = [];
    for (const r of rows) {
      const entries = this.parseEntries(String(r.entries_json ?? '[]'));
      for (const e of entries) {
        const id = Number(e.package_id);
        if (!Number.isNaN(id)) packageIds.push(id);
      }
    }
    const packagePathMap = await this.buildPackagePathMap(packageIds);
    const packageSlugPathMap =
      await this.buildPackageSlugPathFromLayer2Map(packageIds);

    const rawItems: CompetitionEntryPicklistItem[] = [];
    for (const r of rows) {
      const registrationNo = String(r.registration_no ?? '').trim();
      const applicant = String(r.applicant_name ?? '').trim();
      const farmRaw = r.farm_name != null ? String(r.farm_name).trim() : '';
      const farm = farmRaw !== '' ? farmRaw : null;
      const entries = this.parseEntries(String(r.entries_json ?? '[]'));
      for (const e of entries) {
        const packageId = Number(e.package_id);
        if (Number.isNaN(packageId)) continue;
        const idx =
          e.index != null && String(e.index).trim() !== ''
            ? String(e.index).trim()
            : '-';
        const stored =
          e.entry_code != null && String(e.entry_code).trim() !== ''
            ? String(e.entry_code).trim()
            : null;
        const code =
          stored ??
          buildActivityRegistrationEntryCode(
            packageSlugPathMap.get(packageId) ?? null,
            idx && idx !== '-' ? idx : '0000',
          );
        const pkgLabel =
          packagePathMap.get(packageId) ||
          `แพ็กเกจ #${Number.isNaN(packageId) ? '-' : packageId}`;
        const labelParts = [code, applicant || '—'];
        if (registrationNo) labelParts.push(`เลขที่ ${registrationNo}`);
        rawItems.push({
          entry_code: code,
          label: labelParts.join(' · '),
          fish_owner: applicant,
          display_name: farm,
          class_code: code,
          registration_no: registrationNo,
          package_name: pkgLabel,
        });
      }
    }

    const seen = new Set<string>();
    const items: CompetitionEntryPicklistItem[] = [];
    for (const it of rawItems) {
      if (seen.has(it.entry_code)) continue;
      seen.add(it.entry_code);
      items.push(it);
    }
    items.sort((a, b) =>
      a.entry_code.localeCompare(b.entry_code, 'th', { numeric: true }),
    );
    return { items };
  }

  async setItemCheckout(params: {
    registration_id: number;
    entry_index: string;
    checked_out: boolean;
    /** หมายเหตุจากแอดมิน (ตอนยืนยัน checkout) เช่น ปลาไม่ได้คืนที่งาน แต่ส่งกลับ */
    checkout_remark?: string | null;
    actor_user_id?: number | null;
    actor_name?: string | null;
  }): Promise<{ updated: true }> {
    const registration = await this.registrationRepository.findOne({
      where: { id: params.registration_id },
    });
    if (!registration) throw new NotFoundException('ไม่พบรายการสมัคร');

    const targetIndex = (params.entry_index || '').trim();
    if (!targetIndex) throw new BadRequestException('กรุณาระบุ entry_index');

    const entries = this.parseEntries(registration.entries_json);
    let touched = false;
    const nowIso = new Date().toISOString();
    const actorName = (params.actor_name || '').trim() || null;
    const actorId =
      typeof params.actor_user_id === 'number' &&
      Number.isFinite(params.actor_user_id)
        ? params.actor_user_id
        : null;
    const remarkTrim =
      params.checkout_remark != null
        ? String(params.checkout_remark).trim()
        : '';

    const next = entries.map((e) => {
      const idx = e.index != null ? String(e.index).trim() : '';
      if (idx !== targetIndex) return e;
      touched = true;
      if (params.checked_out) {
        return {
          ...e,
          checked_out_at: nowIso,
          checked_out_by_user_id: actorId,
          checked_out_by_name: actorName,
          checkout_remark: remarkTrim || null,
        };
      }
      return {
        ...e,
        checked_out_at: null,
        checked_out_by_user_id: null,
        checked_out_by_name: null,
        checkout_remark: null,
      };
    });

    if (!touched)
      throw new NotFoundException('ไม่พบ item ตาม entry_index ที่ระบุ');

    registration.entries_json = JSON.stringify(next);
    await this.registrationRepository.save(registration);
    await this.recordCheckoutAudit({
      registration,
      entry_index: targetIndex,
      checked_out: params.checked_out,
      checkout_remark: params.checked_out ? remarkTrim || null : null,
      actor_user_id: actorId,
      actor_name: actorName,
    });
    return { updated: true };
  }

  private async recordCheckoutAudit(params: {
    registration: ActivityRegistration;
    entry_index: string;
    checked_out: boolean;
    checkout_remark: string | null;
    actor_user_id: number | null;
    actor_name: string | null;
  }): Promise<void> {
    try {
      const order = await this.orderRepository.findOne({
        where: {
          refer_id: params.registration.id,
          type: OrderType.ACTIVITY_REGISTRATION,
        },
      });
      await this.auditLogService.create({
        action: 'submit',
        entity_type: 'check_out',
        entity_id: params.registration.id,
        checker_user_id: params.actor_user_id,
        checker_name: params.actor_name,
        metadata: {
          registration_no: params.registration.registration_no,
          activity_id: params.registration.activity_id,
          entry_index: params.entry_index,
          checked_out: params.checked_out,
          ...(params.checkout_remark
            ? { checkout_remark: params.checkout_remark }
            : {}),
          ...(order?.order_no ? { order_no: order.order_no } : {}),
        },
      });
    } catch {
      // ไม่ให้ audit ล้มการบันทึก checkout
    }
  }
}
