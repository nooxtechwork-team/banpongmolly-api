import * as fs from 'fs';
import * as path from 'path';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { ReceiptPuppeteerService } from '../order/receipt-puppeteer.service';
import { Activity } from '../entities/activity.entity';
import { ActivityRegistration } from '../entities/activity-registration.entity';
import { ActivityPackage } from '../entities/activity-package.entity';
import { Order, OrderStatus, OrderType } from '../entities/order.entity';
import { buildActivityRegistrationEntryCode } from '../common/utils/activity-registration-entry-code.util';

export interface ActivityAttendanceActivitySummary {
  activity_id: number;
  activity_title: string;
  /** จำนวนผู้สมัคร (จัดกลุ่มตาม user_id หรือเบอร์+ชื่อ เหมือนหน้ารายละเอียด) */
  applicant_count: number;
}

export interface ActivityAttendanceEntryRow {
  row_no: number;
  entry_code: string;
  group_label: string;
  class_label: string;
  type_label: string;
  breed_label: string;
}

/** หนึ่งใบสมัครภายใต้ผู้ใช้เดียวกัน (ไม่ส่งรหัสสมัคร/order ออก API) */
export interface ActivityAttendanceRegistrationSlice {
  registration_id: number;
  /** null = ยังไม่เช็คอิน */
  checked_in_at: string | null;
  /** ใช้เรียงลำดับ / แสดงเมื่อยังไม่เช็คอิน */
  registered_at: string;
  entries: ActivityAttendanceEntryRow[];
}

/** จัดกลุ่มตาม user_id (ถ้ามี) หรือเบอร์+ชื่อผู้สมัครเมื่อไม่มีบัญชี */
export interface ActivityAttendanceUserGroup {
  user_id: number | null;
  /** คีย์สำหรับ UI */
  group_key: string;
  applicant_name: string;
  applicant_phone: string | null;
  farm_name: string | null;
  registration_count: number;
  registrations: ActivityAttendanceRegistrationSlice[];
}

export interface ActivityAttendanceDetailResponse {
  activity: { id: number; title: string };
  users: ActivityAttendanceUserGroup[];
}

type EntryJsonRow = {
  index?: string;
  package_id?: number;
  quantity?: number;
};

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    @InjectRepository(ActivityRegistration)
    private readonly registrationRepository: Repository<ActivityRegistration>,
    @InjectRepository(ActivityPackage)
    private readonly activityPackageRepository: Repository<ActivityPackage>,
    private readonly receiptPuppeteer: ReceiptPuppeteerService,
  ) {}

  private parseEntries(raw: string): EntryJsonRow[] {
    try {
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private toIsoOrNull(raw: unknown): string | null {
    if (raw == null || raw === '') return null;
    if (raw instanceof Date) {
      const t = raw.getTime();
      return Number.isNaN(t) ? null : raw.toISOString();
    }
    const s = String(raw).trim();
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  private registrationSortTimeMs(
    s: ActivityAttendanceRegistrationSlice,
  ): number {
    const iso = s.checked_in_at ?? s.registered_at;
    const t = new Date(iso).getTime();
    return Number.isNaN(t) ? 0 : t;
  }

  /** เวลาสมัครเร็วสุดของกลุ่ม (ใช้เรียงลำดับผู้สมัคร — คนสมัครก่อนอยู่บน / PDF หน้าแรก) */
  private earliestRegisteredAtMs(group: ActivityAttendanceUserGroup): number {
    let min = Infinity;
    for (const s of group.registrations) {
      const t = new Date(s.registered_at).getTime();
      if (!Number.isNaN(t) && t < min) min = t;
    }
    return Number.isFinite(min) ? min : 0;
  }

  private async buildPackageNamePathMap(
    packageIds: number[],
  ): Promise<Map<number, string>> {
    const out = new Map<number, string>();
    if (!packageIds.length) return out;
    const unique = [...new Set(packageIds)];
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

  private escapeRegexToken(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * ตัดรหัสสมัคร (AR…) / เลข order ที่ต่อมาในชื่อ — ไม่ให้ไปแยกกลุ่มเบอร์+ชื่อผิด
   */
  private stripCodesFromApplicantName(
    applicantName: string,
    registrationNo?: string | null,
    orderNo?: string | null,
  ): string {
    let s = String(applicantName ?? '').trim();
    for (const token of [registrationNo, orderNo]) {
      const t = String(token ?? '').trim();
      if (t.length >= 4) {
        s = s.replace(new RegExp(this.escapeRegexToken(t), 'gi'), '');
      }
    }
    s = s.replace(/[,，]\s*AR[A-Z0-9]{8,}\s*[,，]?/gi, ' ');
    s = s.replace(/\bAR[A-Z0-9]{8,}\b/gi, '');
    s = s.replace(/[,，]{2,}/g, ',');
    return s
      .replace(/\s+/g, ' ')
      .replace(/^[,，\s]+|[,，\s]+$/g, '')
      .trim();
  }

  private groupKeyFromRaw(r: {
    user_id?: unknown;
    registration_id?: unknown;
    applicant_phone?: unknown;
    applicant_name?: unknown;
    registration_no?: unknown;
    order_no?: unknown;
  }): string {
    const uidRaw = r.user_id;
    const uidNum =
      uidRaw != null && String(uidRaw).trim() !== '' ? Number(uidRaw) : NaN;
    if (Number.isFinite(uidNum) && uidNum > 0) {
      return `u:${uidNum}`;
    }
    const phone = String(r.applicant_phone ?? '')
      .replace(/\D/g, '')
      .trim();
    const nameClean = this.stripCodesFromApplicantName(
      String(r.applicant_name ?? ''),
      String(r.registration_no ?? ''),
      String(r.order_no ?? ''),
    );
    const name = nameClean.toLowerCase().replace(/\s+/g, ' ').trim();
    if (phone.length >= 9 && name.length > 0) {
      return `p:${phone}|n:${name}`;
    }
    if (phone.length >= 9) {
      return `p:${phone}|n:`;
    }
    return `reg:${Number(r.registration_id)}`;
  }

  /**
   * แยกชื่อจาก path "แม่ / ลูก / ..." — คอลัมน์กลุ่มไม่ใช้ parent ระดับบนสุดของงาน
   * แต่เริ่มที่ลูกชั้นแรก (โหนดที่ 2 ใน path)
   */
  private splitPackageLabels(path: string): {
    group: string;
    klass: string;
    typ: string;
    breed: string;
  } {
    const segments = (path || '')
      .split(' / ')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const tail = segments.length >= 2 ? segments.slice(1) : segments;
    const group = tail[0] ?? '—';
    const klass = tail[1] ?? '—';
    const typ = tail[2] ?? '—';
    const breed =
      tail.length > 3 ? tail.slice(3).join(' / ') : (tail[3] ?? '—');
    return { group, klass, typ, breed };
  }

  private buildEntryRowsForRegistration(
    entriesJson: string,
    slugPathMap: Map<number, string>,
    namePathMap: Map<number, string>,
  ): ActivityAttendanceEntryRow[] {
    const entries = this.parseEntries(entriesJson);
    const rows: ActivityAttendanceEntryRow[] = [];
    let rowNo = 0;
    for (const e of entries) {
      const qty = Math.max(1, Number(e.quantity) || 1);
      const packageId = Number(e.package_id);
      const idxStr =
        e.index != null && String(e.index).trim() !== ''
          ? String(e.index).trim()
          : '';
      const slugPath = slugPathMap.get(packageId) ?? null;
      const path = namePathMap.get(packageId) ?? '';
      const labels = this.splitPackageLabels(path);
      const entryCode = buildActivityRegistrationEntryCode(
        slugPath,
        idxStr || '0000',
      );
      for (let i = 0; i < qty; i++) {
        rowNo += 1;
        rows.push({
          row_no: rowNo,
          entry_code: entryCode,
          group_label: labels.group,
          class_label: labels.klass,
          type_label: labels.typ,
          breed_label: labels.breed,
        });
      }
    }
    return rows;
  }

  async listActivityAttendanceActivities(
    page: number = 1,
    limit: number = 20,
    options?: { search?: string },
  ): Promise<{ items: ActivityAttendanceActivitySummary[]; total: number }> {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const safePage = Math.max(1, page);

    const base = this.activityRepository
      .createQueryBuilder('act')
      .innerJoin(ActivityRegistration, 'reg', 'reg.activity_id = act.id')
      .innerJoin(
        Order,
        'o',
        'o.refer_id = reg.id AND o.type = :otype AND o.status = :paid',
        {
          otype: OrderType.ACTIVITY_REGISTRATION,
          paid: OrderStatus.PAID,
        },
      )
      .where('act.deleted_at IS NULL');

    if (options?.search?.trim()) {
      base.andWhere('act.title LIKE :q', { q: `%${options.search.trim()}%` });
    }

    const totalRow = await base
      .clone()
      .select('COUNT(DISTINCT act.id)', 'cnt')
      .getRawOne();
    const total = Number(totalRow?.cnt ?? 0);

    const raws = await base
      .clone()
      .select('act.id', 'activity_id')
      .addSelect('act.title', 'activity_title')
      .groupBy('act.id')
      .addGroupBy('act.title')
      .orderBy('act.title', 'ASC')
      .offset((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .getRawMany();

    const activityIds = (raws || [])
      .map((r: any) => Number(r.activity_id))
      .filter((id) => Number.isFinite(id));

    const applicantCountByActivity = new Map<number, Set<string>>();
    if (activityIds.length) {
      const regRows = await this.registrationRepository
        .createQueryBuilder('reg')
        .innerJoin(
          Order,
          'o',
          'o.refer_id = reg.id AND o.type = :otype AND o.status = :paid',
          {
            otype: OrderType.ACTIVITY_REGISTRATION,
            paid: OrderStatus.PAID,
          },
        )
        .where('reg.activity_id IN (:...ids)', { ids: activityIds })
        .select('reg.activity_id', 'activity_id')
        .addSelect('reg.id', 'registration_id')
        .addSelect('reg.user_id', 'user_id')
        .addSelect('reg.phone', 'applicant_phone')
        .addSelect('reg.applicant_name', 'applicant_name')
        .addSelect('reg.registration_no', 'registration_no')
        .addSelect('o.order_no', 'order_no')
        .getRawMany();

      for (const row of regRows || []) {
        const aid = Number((row as any).activity_id);
        if (!Number.isFinite(aid)) continue;
        const key = this.groupKeyFromRaw(row as any);
        if (!applicantCountByActivity.has(aid)) {
          applicantCountByActivity.set(aid, new Set());
        }
        applicantCountByActivity.get(aid)!.add(key);
      }
    }

    const items: ActivityAttendanceActivitySummary[] = (raws || []).map(
      (r: any) => {
        const id = Number(r.activity_id);
        return {
          activity_id: id,
          activity_title: String(r.activity_title ?? ''),
          applicant_count: applicantCountByActivity.get(id)?.size ?? 0,
        };
      },
    );

    return { items, total };
  }

  async getActivityAttendanceDetail(
    activityId: number,
  ): Promise<ActivityAttendanceDetailResponse> {
    const activity = await this.activityRepository.findOne({
      where: { id: activityId },
    });
    if (!activity) {
      throw new NotFoundException('ไม่พบกิจกรรม');
    }

    const raws = await this.registrationRepository
      .createQueryBuilder('reg')
      .innerJoin(
        Order,
        'o',
        'o.refer_id = reg.id AND o.type = :otype AND o.status = :paid',
        {
          otype: OrderType.ACTIVITY_REGISTRATION,
          paid: OrderStatus.PAID,
        },
      )
      .where('reg.activity_id = :aid', { aid: activityId })
      .select('reg.id', 'registration_id')
      .addSelect('reg.registration_no', 'registration_no')
      .addSelect('reg.applicant_name', 'applicant_name')
      .addSelect('reg.phone', 'applicant_phone')
      .addSelect('reg.email', 'applicant_email')
      .addSelect('reg.farm_name', 'farm_name')
      .addSelect('reg.user_id', 'user_id')
      .addSelect('reg.entries_json', 'entries_json')
      .addSelect('reg.checked_in_at', 'checked_in_at')
      .addSelect('reg.created_at', 'registration_created_at')
      .addSelect('o.order_no', 'order_no')
      .orderBy('reg.created_at', 'DESC')
      .getRawMany();

    const allPackageIds: number[] = [];
    for (const r of raws || []) {
      const entries = this.parseEntries(String(r.entries_json ?? '[]'));
      for (const e of entries) {
        const id = Number(e.package_id);
        if (!Number.isNaN(id)) allPackageIds.push(id);
      }
    }
    const namePathMap = await this.buildPackageNamePathMap(allPackageIds);
    const slugPathMap =
      await this.buildPackageSlugPathFromLayer2Map(allPackageIds);

    type Acc = {
      user_id: number | null;
      group_key: string;
      slices: ActivityAttendanceRegistrationSlice[];
    };
    const byKey = new Map<string, Acc>();

    for (const r of raws || []) {
      const groupKey = this.groupKeyFromRaw(r);
      const checkedIso = this.toIsoOrNull(r.checked_in_at);
      const registeredIso =
        this.toIsoOrNull(r.registration_created_at) ??
        new Date(0).toISOString();
      const uidRaw = r.user_id;
      const uidNum =
        uidRaw != null && String(uidRaw).trim() !== '' ? Number(uidRaw) : NaN;
      const userId =
        Number.isFinite(uidNum) && uidNum > 0 ? Math.floor(uidNum) : null;

      const slice: ActivityAttendanceRegistrationSlice = {
        registration_id: Number(r.registration_id),
        checked_in_at: checkedIso,
        registered_at: registeredIso,
        entries: this.buildEntryRowsForRegistration(
          String(r.entries_json ?? '[]'),
          slugPathMap,
          namePathMap,
        ),
      };

      const existing = byKey.get(groupKey);
      if (!existing) {
        byKey.set(groupKey, {
          user_id: userId,
          group_key: groupKey,
          slices: [slice],
        });
      } else {
        existing.slices.push(slice);
      }
    }

    const users: ActivityAttendanceUserGroup[] = [];

    for (const acc of byKey.values()) {
      acc.slices.sort(
        (a, b) =>
          this.registrationSortTimeMs(b) - this.registrationSortTimeMs(a),
      );
      const primaryId = acc.slices[0]?.registration_id;
      const primaryRaw = (raws || []).find(
        (raw: any) => Number(raw.registration_id) === primaryId,
      ) as
        | {
            applicant_phone?: unknown;
            farm_name?: unknown;
            applicant_name?: unknown;
            registration_no?: unknown;
            order_no?: unknown;
          }
        | undefined;
      const phoneRaw = primaryRaw?.applicant_phone;
      const farmRaw = primaryRaw?.farm_name;
      const nameDisplay = primaryRaw
        ? this.stripCodesFromApplicantName(
            String(primaryRaw.applicant_name ?? ''),
            String(primaryRaw.registration_no ?? ''),
            String(primaryRaw.order_no ?? ''),
          ).trim()
        : '';

      users.push({
        user_id: acc.user_id,
        group_key: acc.group_key,
        applicant_name: nameDisplay || 'ไม่ระบุชื่อ',
        applicant_phone:
          phoneRaw != null && String(phoneRaw).trim() !== ''
            ? String(phoneRaw).trim()
            : null,
        farm_name:
          farmRaw != null && String(farmRaw).trim() !== ''
            ? String(farmRaw).trim()
            : null,
        registration_count: acc.slices.length,
        registrations: acc.slices,
      });
    }

    users.sort((a, b) => {
      const da = this.earliestRegisteredAtMs(a);
      const db = this.earliestRegisteredAtMs(b);
      if (da !== db) return da - db;
      return a.group_key.localeCompare(b.group_key);
    });

    return {
      activity: { id: activity.id, title: activity.title },
      users,
    };
  }

  private escapeHtmlForPdf(text: string): string {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private formatAttendanceCheckedIn(iso: string | null): string {
    if (iso == null || String(iso).trim() === '') {
      return 'ยังไม่เช็คอิน';
    }
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso);
      return d.toLocaleString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(iso);
    }
  }

  private buildActivityAttendancePdfBodyHtml(
    users: ActivityAttendanceUserGroup[],
  ): string {
    const esc = (s: string) => this.escapeHtmlForPdf(s);
    const parts: string[] = [];
    users.forEach((g, idx) => {
      const blockCls = idx > 0 ? 'user-block page-break' : 'user-block';
      parts.push(`<div class="${blockCls}">`);
      parts.push('<div class="user-head">');
      parts.push(
        `<div class="user-head-row user-head-row--applicant"><span class="user-head-key">ผู้สมัคร:</span> <span class="user-head-value">${esc(g.applicant_name)}</span></div>`,
      );
      parts.push(
        `<div class="user-head-row"><span class="user-head-key">เบอร์โทร:</span> <span class="user-head-value">${esc(g.applicant_phone || '—')}</span></div>`,
      );
      parts.push(
        `<div class="user-head-row"><span class="user-head-key">ฟาร์ม:</span> <span class="user-head-value">${esc(g.farm_name || '—')}</span></div>`,
      );
      parts.push('</div>');
      parts.push('<table><thead><tr>');
      parts.push(
        '<th style="width:36px;">ลำดับ</th><th>รหัสปลา</th><th>กลุ่มการประกวด</th><th>ประเภทการแข่งขัน</th><th>หมวดหมู่ปลา</th><th>คลาสการแข่งขัน</th>',
      );
      parts.push('</tr></thead><tbody>');
      const rows = g.registrations.flatMap((reg) => reg.entries);
      if (!rows.length) {
        parts.push(
          '<tr><td colspan="6" style="text-align:center;color:#6b7280;">ไม่มีรายการ</td></tr>',
        );
      } else {
        rows.forEach((row, i) => {
          parts.push(
            `<tr><td>${esc(String(i + 1))}</td><td style="font-family:ui-monospace,monospace;font-size:9px;">${esc(row.entry_code)}</td><td>${esc(row.group_label)}</td><td>${esc(row.class_label)}</td><td>${esc(row.type_label)}</td><td>${esc(row.breed_label)}</td></tr>`,
          );
        });
      }
      parts.push('</tbody></table>');
      parts.push('</div>');
    });
    return parts.join('\n');
  }

  private resolveActivityAttendancePdfTemplate(): string {
    const name = 'activity-attendance-pdf.html';
    const candidates = [
      path.join(__dirname, 'templates', name),
      path.join(process.cwd(), 'dist', 'report', 'templates', name),
      path.join(process.cwd(), 'src', 'report', 'templates', name),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf8');
      }
    }
    throw new Error(`Missing PDF template: ${name}`);
  }

  /**
   * PDF รายงานผู้สมัครที่ชำระเงินแล้ว — ทั้งกิจกรรมหรือเฉพาะกลุ่มผู้ใช้ (group_key)
   */
  async generateActivityAttendancePdf(
    activityId: number,
    groupKey?: string | null,
  ): Promise<{ pdf: Uint8Array; filename: string }> {
    const detail = await this.getActivityAttendanceDetail(activityId);
    const key = groupKey?.trim() || '';
    let users = detail.users;
    if (key) {
      users = users.filter((u) => u.group_key === key);
      if (!users.length) {
        throw new NotFoundException('ไม่พบผู้ใช้ตามคีย์ที่ระบุในรายงานนี้');
      }
    }
    if (!users.length) {
      throw new NotFoundException('ยังไม่มีผู้สมัครที่ชำระเงินแล้วในงานนี้');
    }

    const generatedAt = new Date().toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const scopeLabel = key ? 'รายงานรายบุคคล' : 'รายงานทั้งหมด';
    const bodyHtml = this.buildActivityAttendancePdfBodyHtml(users);

    let html = this.resolveActivityAttendancePdfTemplate();
    html = html
      .replace(
        /{{activity_title}}/g,
        this.escapeHtmlForPdf(detail.activity.title),
      )
      .replace(/{{generated_at}}/g, this.escapeHtmlForPdf(generatedAt))
      .replace(/{{scope_label}}/g, this.escapeHtmlForPdf(scopeLabel))
      .replace(/{{body}}/g, bodyHtml);

    const pdf = await this.receiptPuppeteer.htmlToPdfBuffer(html);
    const titleSeg = this.sanitizeActivityAttendancePdfFilenameSegment(
      detail.activity.title,
    );
    let filename: string;
    if (!key) {
      filename = this.composeActivityAttendancePdfFilename(['all', titleSeg]);
    } else {
      const nameSeg = this.sanitizeActivityAttendancePdfFilenameSegment(
        users[0].applicant_name,
      );
      filename = this.composeActivityAttendancePdfFilename([nameSeg, titleSeg]);
    }
    return { pdf, filename };
  }

  /** ชื่อไฟล์ PDF: ส่วนหัวเป็น "all - ชื่องาน" หรือ "ชื่อผู้สมัคร - ชื่องาน" */
  private sanitizeActivityAttendancePdfFilenameSegment(raw: string): string {
    return String(raw ?? '')
      .trim()
      .replace(/\p{C}/gu, '')
      .replace(/[/\\:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** เวลาอ้างอิงประเทศไทย — ใส่ท้ายชื่อไฟล์ PDF */
  private filenameTimestampSegment(): string {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const g = (t: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === t)?.value ?? '';
    return `${g('year')}-${g('month')}-${g('day')}_${g('hour')}-${g('minute')}-${g('second')}`;
  }

  private composeActivityAttendancePdfFilename(parts: string[]): string {
    const segments = parts
      .map((p) => this.sanitizeActivityAttendancePdfFilenameSegment(p))
      .filter((p) => p.length > 0);
    const stamp = this.filenameTimestampSegment();
    const stampSuffix = ` - ${stamp}`;
    const maxBaseLen = Math.max(24, 200 - stampSuffix.length);
    let base = segments.join(' - ') || 'activity-attendance';
    if (base.toLowerCase().endsWith('.pdf')) {
      base = base.slice(0, -4).trim();
    }
    if (base.length > maxBaseLen) {
      base = base.slice(0, maxBaseLen).trim();
    }
    return `${base}${stampSuffix}.pdf`;
  }
}
