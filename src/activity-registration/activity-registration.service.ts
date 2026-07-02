import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { ActivityRegistration } from '../entities/activity-registration.entity';
import { ActivityRegistrationEntry } from '../entities/activity-registration-entry.entity';
import {
  ActivityClassChangeRequest,
  ActivityClassChangeRequestStatus,
} from '../entities/activity-class-change-request.entity';
import { ActivityClassChangeLog } from '../entities/activity-class-change-log.entity';
import { Activity, ActivityStatus } from '../entities/activity.entity';
import {
  Order,
  OrderStatus,
  OrderType,
} from '../entities/order.entity';
import { ActivityPackage } from '../entities/activity-package.entity';
import { User } from '../entities/user.entity';
import { ChangeRegistrationClassDto } from './dto/change-registration-class.dto';
import { ActivityService } from '../activity/activity.service';
import { ActivityPackageService } from '../activity-package/activity-package.service';
import { buildActivityRegistrationEntryCode } from '../common/utils/activity-registration-entry-code.util';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  ActivityRegistrationEntryService,
  type ActivityRegistrationEntryLine,
} from './activity-registration-entry.service';

export const CLASS_CHANGE_REQUEST_PREFIX = '[คำขอเปลี่ยนคลาส]';

export interface ClassChangeActivityItem {
  activity_id: number;
  title: string;
  slug: string;
  start_date: string;
  end_date: string;
  location_name: string;
  cover_image: string | null;
}

export interface ClassChangeLookupItem {
  registration_id: number;
  registration_no: string;
  order_no: string;
  activity_id: number;
  activity_title: string;
  activity_slug: string;
  applicant_name: string;
  farm_name: string | null;
  entry_index: string;
  entry_code: string;
  package_id: number;
  package_name: string;
  can_change: boolean;
  block_reason: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  class_change_reason: string | null;
  class_change_at: string | null;
  pending_new_package_id: number | null;
  pending_request_reason: string | null;
}

export interface ClassChangeDisplayItem {
  entry_index: string;
  status: 'pending' | 'applied';
  old_package_id: number;
  new_package_id: number;
  old_package_name: string;
  new_package_name: string;
  reason: string;
  at: string;
}

export interface ClassChangeLogAdminItem {
  id: number;
  changed_at: string;
  registration_id: number;
  registration_no: string;
  order_no: string | null;
  activity_id: number;
  activity_title: string;
  applicant_name: string;
  farm_name: string | null;
  entry_index: string;
  entry_code: string | null;
  old_package_id: number;
  new_package_id: number;
  old_package_name: string;
  new_package_name: string;
  reason: string;
  changed_by_user_id: number;
  changed_by_name: string;
  changed_by_email: string;
  request_id: number | null;
  from_user_request: boolean;
}

type ClassChangeLookupRow = {
  order_no: string;
  order_status: string;
  registration_id: number;
  registration_no: string;
  applicant_name: string;
  farm_name: string | null;
  checked_in_at: Date | string | null;
  activity_id: number;
  activity_title: string;
  activity_slug: string;
  activity_status: string;
};

@Injectable()
export class ActivityRegistrationService {
  constructor(
    @InjectRepository(ActivityRegistration)
    private readonly registrationRepository: Repository<ActivityRegistration>,
    @InjectRepository(ActivityClassChangeRequest)
    private readonly classChangeRequestRepository: Repository<ActivityClassChangeRequest>,
    @InjectRepository(ActivityClassChangeLog)
    private readonly classChangeLogRepository: Repository<ActivityClassChangeLog>,
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(ActivityPackage)
    private readonly activityPackageRepository: Repository<ActivityPackage>,
    @Inject(forwardRef(() => ActivityService))
    private readonly activityService: ActivityService,
    private readonly activityPackageService: ActivityPackageService,
    private readonly auditLogService: AuditLogService,
    private readonly entryService: ActivityRegistrationEntryService,
  ) {}

  async requestClassChange(
    userId: number,
    orderNo: string,
    dto: ChangeRegistrationClassDto,
  ): Promise<{ success: true }> {
    const { registration, activity, order } =
      await this.resolveRegistrationByOrderNo(orderNo, userId, false);

    this.assertCanChangeClass(registration, activity, order);

    const entryIndex = dto.entry_index.trim();
    const entries = await this.entryService.resolveLinesForRegistration(
      registration,
    );
    const entry = entries.find((e) => e.index === entryIndex);
    if (!entry) {
      throw new NotFoundException('ไม่พบรายการตามเลขลำดับที่ระบุ');
    }

    if (
      entry.checked_out_at != null &&
      String(entry.checked_out_at).trim() !== ''
    ) {
      throw new BadRequestException('รายการนี้ checkout แล้ว ไม่สามารถเปลี่ยนคลาสได้');
    }

    const leaf = await this.resolveLeafClass(activity, dto.new_package_id);
    const oldPackageId = Number(entry.package_id);
    if (oldPackageId === leaf.id) {
      throw new BadRequestException('เลือกคลาสเดิมอยู่แล้ว');
    }

    const entryEntity = await this.entryService.requireEntryEntity(
      registration,
      entryIndex,
    );

    const now = new Date();
    const existing = await this.findPendingClassChangeRequest(
      registration.id,
      entryIndex,
      entryEntity.id,
    );

    if (existing) {
      existing.entry_id = entryEntity.id;
      existing.entry_index = entryEntity.entry_index ?? entryIndex;
      existing.old_package_id = oldPackageId;
      existing.new_package_id = leaf.id;
      existing.reason = dto.reason.trim();
      existing.requested_by_user_id = userId;
      existing.requested_at = now;
      await this.classChangeRequestRepository.save(existing);
    } else {
      await this.classChangeRequestRepository.save(
        this.classChangeRequestRepository.create({
          registration_id: registration.id,
          entry_id: entryEntity.id,
          entry_index: entryEntity.entry_index ?? entryIndex,
          old_package_id: oldPackageId,
          new_package_id: leaf.id,
          reason: dto.reason.trim(),
          requested_by_user_id: userId,
          requested_at: now,
          status: ActivityClassChangeRequestStatus.PENDING,
        }),
      );
    }

    return { success: true };
  }

  async changeClass(
    registrationId: number,
    dto: ChangeRegistrationClassDto,
    adminUserId: number,
  ): Promise<ActivityRegistration> {
    const registration = await this.registrationRepository.findOne({
      where: { id: registrationId },
    });
    if (!registration) {
      throw new NotFoundException('ไม่พบข้อมูลการสมัคร');
    }

    const activity = await this.activityRepository.findOne({
      where: { id: registration.activity_id },
    });
    if (!activity) {
      throw new NotFoundException('ไม่พบกิจกรรมที่เกี่ยวข้อง');
    }

    const order = await this.orderRepository.findOne({
      where: {
        refer_id: registration.id,
        type: OrderType.ACTIVITY_REGISTRATION,
      },
    });
    if (!order) {
      throw new NotFoundException('ไม่พบคำสั่งซื้อที่เกี่ยวข้อง');
    }

    this.assertCanChangeClass(registration, activity, order);

    const updated = await this.applyClassChange(
      registration,
      activity,
      dto,
      adminUserId,
    );
    return updated;
  }

  async changeClassByOrderNo(
    orderNo: string,
    dto: ChangeRegistrationClassDto,
    adminUserId: number,
  ): Promise<ActivityRegistration> {
    const { registration, activity } = await this.resolveRegistrationByOrderNo(
      orderNo,
      adminUserId,
      true,
    );
    const order = await this.orderRepository.findOne({
      where: {
        refer_id: registration.id,
        type: OrderType.ACTIVITY_REGISTRATION,
      },
    });
    if (!order) {
      throw new NotFoundException('ไม่พบคำสั่งซื้อที่เกี่ยวข้อง');
    }
    this.assertCanChangeClass(registration, activity, order);
    return this.applyClassChange(registration, activity, dto, adminUserId);
  }

  async listClassChangesForRegistration(
    registrationId: number,
  ): Promise<ClassChangeDisplayItem[]> {
    const [pendingRows, logRows] = await Promise.all([
      this.classChangeRequestRepository.find({
        where: {
          registration_id: registrationId,
          status: ActivityClassChangeRequestStatus.PENDING,
        },
        order: { requested_at: 'DESC' },
      }),
      this.classChangeLogRepository.find({
        where: { registration_id: registrationId },
        order: { changed_at: 'DESC' },
      }),
    ]);

    const packageIds = new Set<number>();
    for (const row of pendingRows) {
      packageIds.add(row.old_package_id);
      packageIds.add(row.new_package_id);
    }
    for (const row of logRows) {
      packageIds.add(row.old_package_id);
      packageIds.add(row.new_package_id);
    }

    const packageNameById = await this.loadPackageNamePathByLeafIds([
      ...packageIds,
    ]);

    const items: ClassChangeDisplayItem[] = [];

    for (const row of pendingRows) {
      items.push({
        entry_index: row.entry_index,
        status: 'pending',
        old_package_id: row.old_package_id,
        new_package_id: row.new_package_id,
        old_package_name:
          packageNameById.get(row.old_package_id) ??
          `แพ็กเกจ #${row.old_package_id}`,
        new_package_name:
          packageNameById.get(row.new_package_id) ??
          `แพ็กเกจ #${row.new_package_id}`,
        reason: row.reason,
        at: this.toIsoOrNull(row.requested_at) ?? row.requested_at.toISOString(),
      });
    }

    for (const row of logRows) {
      items.push({
        entry_index: row.entry_index,
        status: 'applied',
        old_package_id: row.old_package_id,
        new_package_id: row.new_package_id,
        old_package_name:
          packageNameById.get(row.old_package_id) ??
          `แพ็กเกจ #${row.old_package_id}`,
        new_package_name:
          packageNameById.get(row.new_package_id) ??
          `แพ็กเกจ #${row.new_package_id}`,
        reason: row.reason,
        at: this.toIsoOrNull(row.changed_at) ?? row.changed_at.toISOString(),
      });
    }

    items.sort((a, b) => b.at.localeCompare(a.at));
    return items;
  }

  async listClassChangeLogsForAdmin(params: {
    page?: number;
    limit?: number;
    activity_id?: number;
    q?: string;
    from?: string;
    to?: string;
  }): Promise<{ items: ClassChangeLogAdminItem[]; total: number }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));

    const buildBaseQb = () => {
      const qb = this.classChangeLogRepository
        .createQueryBuilder('log')
        .innerJoin(ActivityRegistration, 'reg', 'reg.id = log.registration_id')
        .innerJoin(Activity, 'act', 'act.id = reg.activity_id')
        .leftJoin(ActivityRegistrationEntry, 'entry', 'entry.id = log.entry_id')
        .leftJoin(
          Order,
          'ord',
          'ord.refer_id = reg.id AND ord.type = :orderType',
          { orderType: OrderType.ACTIVITY_REGISTRATION },
        );

      if (params.activity_id) {
        qb.andWhere('reg.activity_id = :activityId', {
          activityId: params.activity_id,
        });
      }
      if (params.from) {
        const fromRaw = params.from.trim();
        const fromVal = /^\d{4}-\d{2}-\d{2}$/.test(fromRaw)
          ? `${fromRaw} 00:00:00`
          : fromRaw;
        qb.andWhere('log.changed_at >= :from', { from: fromVal });
      }
      if (params.to) {
        const toRaw = params.to.trim();
        const toVal = /^\d{4}-\d{2}-\d{2}$/.test(toRaw)
          ? `${toRaw} 23:59:59`
          : toRaw;
        qb.andWhere('log.changed_at <= :to', { to: toVal });
      }

      const q = params.q?.trim();
      if (q) {
        qb.andWhere(
          `(
            entry.entry_code LIKE :qLike
            OR reg.applicant_name LIKE :qLike
            OR reg.registration_no LIKE :qLike
            OR ord.order_no LIKE :qLike
            OR log.reason LIKE :qLike
          )`,
          { qLike: `%${q}%` },
        );
      }

      return qb;
    };

    const total = await buildBaseQb().getCount();

    const raws = await buildBaseQb()
      .leftJoin(User, 'admin', 'admin.id = log.changed_by_user_id')
      .select('log.id', 'id')
      .addSelect('log.changed_at', 'changed_at')
      .addSelect('log.registration_id', 'registration_id')
      .addSelect('log.entry_index', 'entry_index')
      .addSelect('log.old_package_id', 'old_package_id')
      .addSelect('log.new_package_id', 'new_package_id')
      .addSelect('log.reason', 'reason')
      .addSelect('log.changed_by_user_id', 'changed_by_user_id')
      .addSelect('log.request_id', 'request_id')
      .addSelect('reg.registration_no', 'registration_no')
      .addSelect('reg.applicant_name', 'applicant_name')
      .addSelect('reg.farm_name', 'farm_name')
      .addSelect('act.id', 'activity_id')
      .addSelect('act.title', 'activity_title')
      .addSelect('entry.entry_code', 'entry_code')
      .addSelect('ord.order_no', 'order_no')
      .addSelect('admin.fullname', 'changed_by_name')
      .addSelect('admin.email', 'changed_by_email')
      .orderBy('log.changed_at', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany();

    const packageIds = new Set<number>();
    for (const row of raws) {
      packageIds.add(Number(row.old_package_id));
      packageIds.add(Number(row.new_package_id));
    }
    const packageNameById = await this.loadPackageNamePathByLeafIds([
      ...packageIds,
    ]);

    const items: ClassChangeLogAdminItem[] = raws.map((row) => {
      const oldPackageId = Number(row.old_package_id);
      const newPackageId = Number(row.new_package_id);
      const changedAt = row.changed_at;
      return {
        id: Number(row.id),
        changed_at:
          changedAt instanceof Date
            ? changedAt.toISOString()
            : String(changedAt ?? ''),
        registration_id: Number(row.registration_id),
        registration_no: String(row.registration_no ?? ''),
        order_no:
          row.order_no != null && String(row.order_no).trim() !== ''
            ? String(row.order_no).trim()
            : null,
        activity_id: Number(row.activity_id),
        activity_title: String(row.activity_title ?? ''),
        applicant_name: String(row.applicant_name ?? ''),
        farm_name:
          row.farm_name != null && String(row.farm_name).trim() !== ''
            ? String(row.farm_name).trim()
            : null,
        entry_index: String(row.entry_index ?? ''),
        entry_code:
          row.entry_code != null && String(row.entry_code).trim() !== ''
            ? String(row.entry_code).trim()
            : null,
        old_package_id: oldPackageId,
        new_package_id: newPackageId,
        old_package_name:
          packageNameById.get(oldPackageId) ?? `แพ็กเกจ #${oldPackageId}`,
        new_package_name:
          packageNameById.get(newPackageId) ?? `แพ็กเกจ #${newPackageId}`,
        reason: String(row.reason ?? ''),
        changed_by_user_id: Number(row.changed_by_user_id),
        changed_by_name: String(row.changed_by_name ?? '—'),
        changed_by_email: String(row.changed_by_email ?? ''),
        request_id:
          row.request_id != null && Number.isFinite(Number(row.request_id))
            ? Number(row.request_id)
            : null,
        from_user_request: row.request_id != null,
      };
    });

    return { items, total };
  }

  private async resolveRegistrationByOrderNo(
    orderNo: string,
    userId: number,
    isAdmin: boolean,
  ): Promise<{
    registration: ActivityRegistration;
    activity: Activity;
    order: Order;
  }> {
    const order = await this.orderRepository.findOne({
      where: { order_no: orderNo.trim() },
    });
    if (!order) {
      throw new NotFoundException('ไม่พบคำสั่งซื้อ');
    }
    if (order.type !== OrderType.ACTIVITY_REGISTRATION) {
      throw new BadRequestException('ใช้ได้เฉพาะคำสั่งซื้อสมัครกิจกรรม');
    }
    if (!isAdmin && order.user_id !== userId) {
      throw new NotFoundException('ไม่พบคำสั่งซื้อ');
    }

    const registration = await this.registrationRepository.findOne({
      where: { id: order.refer_id },
    });
    if (!registration) {
      throw new NotFoundException('ไม่พบใบสมัคร');
    }

    const activity = await this.activityRepository.findOne({
      where: { id: registration.activity_id },
    });
    if (!activity) {
      throw new NotFoundException('ไม่พบกิจกรรมที่เกี่ยวข้อง');
    }

    return { registration, activity, order };
  }

  private assertCanChangeClass(
    registration: ActivityRegistration,
    activity: Activity,
    order: Order,
  ): void {
    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException(
        'เปลี่ยนคลาสได้เฉพาะใบสมัครที่ชำระเงินแล้ว',
      );
    }
    if (activity.status === ActivityStatus.FINISHED) {
      throw new BadRequestException('กิจกรรมจบแล้ว ไม่สามารถเปลี่ยนคลาสได้');
    }
  }

  private parseEntries(entriesJson: string): Record<string, unknown>[] {
    try {
      const parsed = JSON.parse(entriesJson || '[]');
      if (!Array.isArray(parsed)) {
        throw new BadRequestException('ข้อมูลรายการไม่ถูกต้อง');
      }
      return parsed as Record<string, unknown>[];
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException('ข้อมูลรายการไม่ถูกต้อง');
    }
  }

  private findEntryByIndex(
    entries: Record<string, unknown>[],
    entryIndex: string,
  ): Record<string, unknown> | null {
    const target = entryIndex.trim();
    return (
      entries.find((e) => {
        const idx =
          e.index != null && String(e.index).trim() !== ''
            ? String(e.index).trim()
            : '';
        return idx === target;
      }) ?? null
    );
  }

  private async resolveLeafClass(
    activity: Activity,
    packageId: number,
  ): Promise<{ id: number; full_path: string; name: string }> {
    const leafClasses = await this.activityService.getLeafClassesForSlug(
      activity.slug,
    );
    const found = leafClasses.find((c) => c.id === packageId);
    if (!found) {
      throw new BadRequestException('คลาสที่เลือกไม่ได้อยู่ในกิจกรรมนี้');
    }
    return found;
  }

  private async applyClassChange(
    registration: ActivityRegistration,
    activity: Activity,
    dto: ChangeRegistrationClassDto,
    adminUserId: number,
  ): Promise<ActivityRegistration> {
    const entryIndex = dto.entry_index.trim();
    const entries = await this.entryService.resolveLinesForRegistration(
      registration,
    );
    const oldEntry = entries.find((e) => e.index === entryIndex);
    if (!oldEntry) {
      throw new NotFoundException('ไม่พบรายการตามเลขลำดับที่ระบุ');
    }

    if (
      oldEntry.checked_out_at != null &&
      String(oldEntry.checked_out_at).trim() !== ''
    ) {
      throw new BadRequestException('รายการนี้ checkout แล้ว ไม่สามารถเปลี่ยนคลาสได้');
    }

    const leaf = await this.resolveLeafClass(activity, dto.new_package_id);
    const oldPackageId = Number(oldEntry.package_id);
    if (oldPackageId === leaf.id) {
      throw new BadRequestException('เลือกคลาสเดิมอยู่แล้ว');
    }

    const slugPaths =
      await this.activityPackageService.findSlugPathFromLayer2ByLeafIds([
        leaf.id,
      ]);
    const slugPath = slugPaths.get(leaf.id) ?? null;
    const entryCode = buildActivityRegistrationEntryCode(
      slugPath,
      entryIndex,
    );

    const changedAt = new Date();

    const entryEntity = await this.entryService.requireEntryEntity(
      registration,
      entryIndex,
    );

    await this.entryService.updateEntry(registration, entryIndex, (line) => ({
      ...line,
      package_id: leaf.id,
      entry_code: entryCode,
    }));

    const saved = await this.registrationRepository.findOne({
      where: { id: registration.id },
    });
    if (!saved) {
      throw new NotFoundException('ไม่พบข้อมูลการสมัคร');
    }

    const savedRegistration = saved;
    await this.registrationRepository.manager.transaction(async (manager) => {
      const requestRepo = manager.getRepository(ActivityClassChangeRequest);
      const logRepo = manager.getRepository(ActivityClassChangeLog);

      const pending = await this.findPendingClassChangeRequest(
        registration.id,
        entryIndex,
        entryEntity.id,
        requestRepo,
      );

      await logRepo.save(
        logRepo.create({
          registration_id: registration.id,
          entry_id: entryEntity.id,
          entry_index: entryEntity.entry_index ?? entryIndex,
          old_package_id: oldPackageId,
          new_package_id: leaf.id,
          reason: dto.reason.trim(),
          changed_by_user_id: adminUserId,
          changed_at: changedAt,
          request_id: pending?.id ?? null,
        }),
      );

      if (pending) {
        pending.entry_id = entryEntity.id;
        pending.entry_index = entryEntity.entry_index ?? entryIndex;
        pending.status = ActivityClassChangeRequestStatus.APPROVED;
        pending.resolved_at = changedAt;
        pending.resolved_by_user_id = adminUserId;
        await requestRepo.save(pending);
      }
    });

    await this.auditLogService.create({
      action: 'edit',
      entity_type: 'activity',
      entity_id: registration.id,
      checker_user_id: adminUserId,
      metadata: {
        type: 'class_change',
        entry_index: entryIndex,
        old_package_id: oldPackageId,
        new_package_id: leaf.id,
        new_package_name: leaf.full_path,
        reason: dto.reason.trim(),
      },
    });

    return savedRegistration;
  }

  async listActivitiesForClassChange(options: {
    userId?: number;
    isAdmin?: boolean;
  }): Promise<{ items: ClassChangeActivityItem[] }> {
    if (options.isAdmin) {
      return this.listAdminActivitiesForClassChange();
    }

    const qb = this.orderRepository
      .createQueryBuilder('o')
      .innerJoin(ActivityRegistration, 'reg', 'reg.id = o.refer_id')
      .innerJoin(Activity, 'a', 'a.id = reg.activity_id')
      .select([
        'a.id AS activity_id',
        'a.title AS title',
        'a.slug AS slug',
        'a.start_date AS start_date',
        'a.end_date AS end_date',
        'a.location_name AS location_name',
        'a.cover_image AS cover_image',
      ])
      .where('o.type = :type', { type: OrderType.ACTIVITY_REGISTRATION })
      .andWhere('o.status = :status', { status: OrderStatus.PAID })
      .andWhere('a.status != :finished', { finished: ActivityStatus.FINISHED })
      .andWhere('a.deleted_at IS NULL');

    if (!options.isAdmin && options.userId) {
      qb.andWhere('o.user_id = :userId', { userId: options.userId });
    }

    const rows = await qb
      .groupBy('a.id')
      .addGroupBy('a.title')
      .addGroupBy('a.slug')
      .addGroupBy('a.start_date')
      .addGroupBy('a.end_date')
      .addGroupBy('a.location_name')
      .addGroupBy('a.cover_image')
      .orderBy('a.start_date', 'DESC')
      .addOrderBy('a.title', 'ASC')
      .getRawMany();

    const items = (rows || []).map((row) => ({
      activity_id: Number(row.activity_id),
      title: String(row.title ?? ''),
      slug: String(row.slug ?? ''),
      start_date:
        row.start_date instanceof Date
          ? row.start_date.toISOString().slice(0, 10)
          : String(row.start_date ?? ''),
      end_date:
        row.end_date instanceof Date
          ? row.end_date.toISOString().slice(0, 10)
          : String(row.end_date ?? ''),
      location_name: String(row.location_name ?? ''),
      cover_image:
        row.cover_image != null && String(row.cover_image).trim() !== ''
          ? String(row.cover_image).trim()
          : null,
    }));

    return { items };
  }

  private async listAdminActivitiesForClassChange(): Promise<{
    items: ClassChangeActivityItem[];
  }> {
    const rows = await this.activityRepository
      .createQueryBuilder('a')
      .where('a.deleted_at IS NULL')
      .andWhere(
        `(a.status != :finished OR EXISTS (
          SELECT 1
          FROM activity_class_change_requests req
          INNER JOIN activity_registrations reg ON reg.id = req.registration_id
          WHERE reg.activity_id = a.id AND req.status = :pending
        ))`,
        {
          finished: ActivityStatus.FINISHED,
          pending: ActivityClassChangeRequestStatus.PENDING,
        },
      )
      .orderBy('a.start_date', 'DESC')
      .addOrderBy('a.title', 'ASC')
      .getMany();

    return {
      items: rows.map((activity) => this.toClassChangeActivityItem(activity)),
    };
  }

  private toClassChangeActivityItem(activity: Activity): ClassChangeActivityItem {
    return {
      activity_id: activity.id,
      title: activity.title ?? '',
      slug: activity.slug ?? '',
      start_date:
        activity.start_date instanceof Date
          ? activity.start_date.toISOString().slice(0, 10)
          : String(activity.start_date ?? ''),
      end_date:
        activity.end_date instanceof Date
          ? activity.end_date.toISOString().slice(0, 10)
          : String(activity.end_date ?? ''),
      location_name: activity.location_name ?? '',
      cover_image:
        activity.cover_image != null && String(activity.cover_image).trim() !== ''
          ? String(activity.cover_image).trim()
          : null,
    };
  }

  async listPendingClassChangesForAdmin(
    activityId: number,
  ): Promise<{ items: ClassChangeLookupItem[] }> {
    const id = Number(activityId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestException('กรุณาเลือกกิจกรรม');
    }

    const activity = await this.activityRepository.findOne({
      where: { id },
    });
    if (!activity || activity.deleted_at) {
      throw new NotFoundException('ไม่พบกิจกรรม');
    }
    if (activity.status === ActivityStatus.FINISHED) {
      return { items: [] };
    }

    const pendingRequests = await this.classChangeRequestRepository
      .createQueryBuilder('req')
      .innerJoin(ActivityRegistration, 'reg', 'reg.id = req.registration_id')
      .where('req.status = :status', {
        status: ActivityClassChangeRequestStatus.PENDING,
      })
      .andWhere('reg.activity_id = :activityId', { activityId: id })
      .orderBy('req.requested_at', 'ASC')
      .getMany();

    if (!pendingRequests.length) {
      return { items: [] };
    }

    const registrationIds = [
      ...new Set(pendingRequests.map((row) => row.registration_id)),
    ];
    const rows = await this.fetchClassChangeRows({
      isAdmin: true,
      activityId: id,
      registrationIds,
    });

    const lookupItems = await this.buildClassChangeLookupItems(rows, '', true);
    const pendingKeys = new Set(
      pendingRequests.map((row) =>
        this.entryKey(row.registration_id, row.entry_index),
      ),
    );
    const orderByKey = new Map(
      pendingRequests.map((row, index) => [
        this.entryKey(row.registration_id, row.entry_index),
        index,
      ]),
    );

    const items = lookupItems
      .filter((item) =>
        pendingKeys.has(this.entryKey(item.registration_id, item.entry_index)),
      )
      .sort((a, b) => {
        const ai =
          orderByKey.get(this.entryKey(a.registration_id, a.entry_index)) ?? 0;
        const bi =
          orderByKey.get(this.entryKey(b.registration_id, b.entry_index)) ?? 0;
        return ai - bi;
      });

    return { items };
  }

  async lookupForClassChange(
    rawQuery: string,
    options: { userId?: number; isAdmin?: boolean; activityId: number },
  ): Promise<{ items: ClassChangeLookupItem[] }> {
    const activityId = Number(options.activityId);
    if (!Number.isFinite(activityId) || activityId <= 0) {
      throw new BadRequestException('กรุณาเลือกกิจกรรม');
    }

    const activity = await this.activityRepository.findOne({
      where: { id: activityId },
    });
    if (!activity || activity.deleted_at) {
      throw new NotFoundException('ไม่พบกิจกรรม');
    }
    if (activity.status === ActivityStatus.FINISHED) {
      throw new BadRequestException('กิจกรรมจบแล้ว ไม่สามารถเปลี่ยนคลาสได้');
    }

    const query = (rawQuery || '').trim();
    if (!query) {
      throw new BadRequestException('กรุณาระบุคำค้นหา');
    }
    const normalized = query.startsWith('#') ? query.slice(1) : query;
    const qLower = normalized.toLowerCase();

    const exactRows = await this.fetchClassChangeRows({
      userId: options.userId,
      isAdmin: options.isAdmin,
      activityId,
      exactCode: normalized,
      rawCode: query,
    });

    let rows = exactRows;
    let matchAllEntries = exactRows.length > 0;

    if (!rows.length) {
      rows = await this.fetchClassChangeRows({
        userId: options.userId,
        isAdmin: options.isAdmin,
        activityId,
        limit: options.isAdmin ? 500 : 150,
      });
      matchAllEntries = false;
    }

    const items = await this.buildClassChangeLookupItems(
      rows,
      qLower,
      matchAllEntries,
    );

    if (!items.length) {
      throw new NotFoundException('ไม่พบรายการที่ตรงกับคำค้นหา');
    }

    return { items };
  }

  private async fetchClassChangeRows(params: {
    userId?: number;
    isAdmin?: boolean;
    activityId: number;
    exactCode?: string;
    rawCode?: string;
    registrationIds?: number[];
    limit?: number;
  }): Promise<ClassChangeLookupRow[]> {
    const qb = this.orderRepository
      .createQueryBuilder('o')
      .innerJoin(ActivityRegistration, 'reg', 'reg.id = o.refer_id')
      .innerJoin(Activity, 'a', 'a.id = reg.activity_id')
      .select([
        'o.order_no AS order_no',
        'o.status AS order_status',
        'reg.id AS registration_id',
        'reg.registration_no AS registration_no',
        'reg.applicant_name AS applicant_name',
        'reg.farm_name AS farm_name',
        'reg.checked_in_at AS checked_in_at',
        'a.id AS activity_id',
        'a.title AS activity_title',
        'a.slug AS activity_slug',
        'a.status AS activity_status',
      ])
      .where('o.type = :type', { type: OrderType.ACTIVITY_REGISTRATION })
      .andWhere('o.status = :status', { status: OrderStatus.PAID })
      .andWhere('a.deleted_at IS NULL')
      .andWhere('a.id = :activityId', { activityId: params.activityId });

    if (!params.isAdmin && params.userId) {
      qb.andWhere('o.user_id = :userId', { userId: params.userId });
    }

    if (params.exactCode) {
      qb.andWhere(
        '(o.order_no = :q OR o.order_no = :raw OR reg.registration_no = :q OR reg.registration_no = :raw)',
        { q: params.exactCode, raw: params.rawCode ?? params.exactCode },
      );
    }

    if (params.registrationIds?.length) {
      qb.andWhere('reg.id IN (:...registrationIds)', {
        registrationIds: params.registrationIds,
      });
    }

    qb.orderBy('reg.updated_at', 'DESC');
    if (params.limit) {
      qb.limit(params.limit);
    } else if (!params.registrationIds?.length) {
      qb.limit(params.isAdmin ? 50 : 20);
    }

    return qb.getRawMany();
  }

  private async buildClassChangeLookupItems(
    rows: ClassChangeLookupRow[],
    qLower: string,
    includeAllEntries: boolean,
  ): Promise<ClassChangeLookupItem[]> {
    const items: ClassChangeLookupItem[] = [];
    const packageIds = new Set<number>();
    const registrationIds = [
      ...new Set(rows.map((row) => Number(row.registration_id))),
    ];
    const linesMap =
      await this.entryService.findLinesMapByRegistrationIds(registrationIds);

    const [pendingMap, latestLogMap] = await Promise.all([
      this.loadPendingRequestsMap(registrationIds),
      this.loadLatestLogsMap(registrationIds),
    ]);

    for (const lines of linesMap.values()) {
      for (const e of lines) {
        if (!Number.isNaN(e.package_id)) packageIds.add(e.package_id);
      }
    }
    for (const pending of pendingMap.values()) {
      packageIds.add(pending.old_package_id);
      packageIds.add(pending.new_package_id);
    }
    for (const log of latestLogMap.values()) {
      packageIds.add(log.old_package_id);
      packageIds.add(log.new_package_id);
    }

    const [slugPaths, packageNameById] = await Promise.all([
      this.activityPackageService.findSlugPathFromLayer2ByLeafIds([
        ...packageIds,
      ]),
      this.loadPackageNamePathByLeafIds([...packageIds]),
    ]);

    for (const row of rows) {
      const entries = linesMap.get(Number(row.registration_id)) ?? [];
      const checkedInAt = this.toIsoOrNull(row.checked_in_at);
      const registrationId = Number(row.registration_id);

      for (const e of entries) {
        const packageId = Number(e.package_id);
        const idx = e.index?.trim() ?? '';
        if (!idx) continue;

        const entryCode =
          e.entry_code?.trim() ||
          buildActivityRegistrationEntryCode(
            slugPaths.get(packageId) ?? null,
            idx,
          );
        const packageName =
          packageNameById.get(packageId) ?? `แพ็กเกจ #${packageId}`;
        const checkedOutAt =
          e.checked_out_at != null && String(e.checked_out_at).trim() !== ''
            ? String(e.checked_out_at).trim()
            : null;

        if (!includeAllEntries) {
          const haystack = [
            entryCode,
            row.order_no,
            row.registration_no,
            row.applicant_name,
            row.farm_name ?? '',
            packageName,
          ]
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(qLower)) continue;
        }

        const blockReason = this.resolveClassChangeBlockReason(
          row,
          checkedOutAt,
        );
        const entryClassChange = this.resolveEntryClassChangeInfo(
          registrationId,
          idx,
          pendingMap,
          latestLogMap,
          packageNameById,
        );
        items.push({
          registration_id: registrationId,
          registration_no: row.registration_no ?? '',
          order_no: row.order_no ?? '',
          activity_id: Number(row.activity_id),
          activity_title: row.activity_title ?? '',
          activity_slug: row.activity_slug ?? '',
          applicant_name: row.applicant_name ?? '',
          farm_name: row.farm_name ?? null,
          entry_index: idx,
          entry_code: entryCode,
          package_id: packageId,
          package_name: packageName,
          can_change: !blockReason,
          block_reason: blockReason,
          checked_in_at: checkedInAt,
          checked_out_at: checkedOutAt,
          class_change_reason: entryClassChange.class_change_reason,
          class_change_at: entryClassChange.class_change_at,
          pending_new_package_id: entryClassChange.pending_new_package_id,
          pending_request_reason: entryClassChange.pending_request_reason,
        });
      }
    }

    items.sort((a, b) => {
      const byCode = a.entry_code.localeCompare(b.entry_code, 'th', {
        numeric: true,
      });
      if (byCode !== 0) return byCode;
      return a.order_no.localeCompare(b.order_no, 'th', { numeric: true });
    });

    return items;
  }

  private async findPendingClassChangeRequest(
    registrationId: number,
    entryIndex: string,
    entryId: number,
    repository: Repository<ActivityClassChangeRequest> = this.classChangeRequestRepository,
  ): Promise<ActivityClassChangeRequest | null> {
    const byEntryId = await repository.findOne({
      where: {
        entry_id: entryId,
        status: ActivityClassChangeRequestStatus.PENDING,
      },
    });
    if (byEntryId) return byEntryId;

    return repository.findOne({
      where: {
        registration_id: registrationId,
        entry_index: entryIndex,
        status: ActivityClassChangeRequestStatus.PENDING,
      },
    });
  }

  private async loadPendingRequestsMap(
    registrationIds: number[],
  ): Promise<Map<string, ActivityClassChangeRequest>> {
    const map = new Map<string, ActivityClassChangeRequest>();
    if (!registrationIds.length) return map;

    const rows = await this.classChangeRequestRepository.find({
      where: {
        registration_id: In(registrationIds),
        status: ActivityClassChangeRequestStatus.PENDING,
      },
    });

    for (const row of rows) {
      map.set(this.entryKey(row.registration_id, row.entry_index), row);
    }
    return map;
  }

  private async loadLatestLogsMap(
    registrationIds: number[],
  ): Promise<Map<string, ActivityClassChangeLog>> {
    const map = new Map<string, ActivityClassChangeLog>();
    if (!registrationIds.length) return map;

    const rows = await this.classChangeLogRepository
      .createQueryBuilder('log')
      .where('log.registration_id IN (:...ids)', { ids: registrationIds })
      .orderBy('log.changed_at', 'DESC')
      .getMany();

    for (const row of rows) {
      const key = this.entryKey(row.registration_id, row.entry_index);
      if (!map.has(key)) {
        map.set(key, row);
      }
    }
    return map;
  }

  private entryKey(registrationId: number, entryIndex: string): string {
    return `${registrationId}:${entryIndex}`;
  }

  private resolveClassChangeBlockReason(
    row: ClassChangeLookupRow,
    checkedOutAt: string | null,
  ): string | null {
    if (row.order_status !== OrderStatus.PAID) {
      return 'ยังไม่ได้ชำระเงิน';
    }
    if (row.activity_status === ActivityStatus.FINISHED) {
      return 'กิจกรรมจบแล้ว';
    }
    if (checkedOutAt) {
      return 'รายการนี้ checkout แล้ว';
    }
    return null;
  }

  private formatClassChangeRequestText(
    entryIndex: string,
    targetName: string,
    reason: string,
  ): string {
    let text = `${CLASS_CHANGE_REQUEST_PREFIX} รายการ #${entryIndex}`;
    if (targetName) text += ` → ${targetName}`;
    if (reason.trim()) text += ` | เหตุผล: ${reason.trim()}`;
    return text;
  }

  private resolveEntryClassChangeInfo(
    registrationId: number,
    entryIndex: string,
    pendingMap: Map<string, ActivityClassChangeRequest>,
    latestLogMap: Map<string, ActivityClassChangeLog>,
    packageNameById: Map<number, string>,
  ): {
    class_change_reason: string | null;
    class_change_at: string | null;
    pending_new_package_id: number | null;
    pending_request_reason: string | null;
  } {
    const key = this.entryKey(registrationId, entryIndex);
    const pending = pendingMap.get(key);
    if (pending) {
      const targetName =
        packageNameById.get(pending.new_package_id) ??
        `แพ็กเกจ #${pending.new_package_id}`;
      return {
        class_change_reason: this.formatClassChangeRequestText(
          entryIndex,
          targetName,
          pending.reason,
        ),
        class_change_at: null,
        pending_new_package_id: pending.new_package_id,
        pending_request_reason: pending.reason,
      };
    }

    const log = latestLogMap.get(key);
    if (log) {
      return {
        class_change_reason: log.reason,
        class_change_at: this.toIsoOrNull(log.changed_at),
        pending_new_package_id: null,
        pending_request_reason: null,
      };
    }

    return {
      class_change_reason: null,
      class_change_at: null,
      pending_new_package_id: null,
      pending_request_reason: null,
    };
  }

  private toIsoOrNull(value: Date | string | null | undefined): string | null {
    if (value == null) return null;
    if (value instanceof Date) return value.toISOString();
    const s = String(value).trim();
    return s || null;
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
}
