import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { ActivityRegistration } from '../entities/activity-registration.entity';
import { ActivityRegistrationEntry } from '../entities/activity-registration-entry.entity';
import { Activity } from '../entities/activity.entity';
import { Order, OrderStatus, OrderType } from '../entities/order.entity';
import { ActivityPackageService } from '../activity-package/activity-package.service';
import {
  allocateFormattedActivityEntryIndices,
} from '../common/utils/activity-entry-index.util';
import { buildActivityRegistrationEntryCode } from '../common/utils/activity-registration-entry-code.util';

export interface ActivityRegistrationEntryLine {
  index: string | null;
  entry_code?: string | null;
  package_id: number;
  quantity: number;
  unit_price: number;
  line_total: number;
  checked_out_at?: string | null;
  checked_out_by_user_id?: number | null;
  checked_out_by_name?: string | null;
  checkout_requested_at?: string | null;
  checkout_request_note?: string | null;
  checkout_request_email_sent_at?: string | null;
  checkout_remark?: string | null;
}

@Injectable()
export class ActivityRegistrationEntryService {
  constructor(
    @InjectRepository(ActivityRegistrationEntry)
    private readonly entryRepository: Repository<ActivityRegistrationEntry>,
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    private readonly activityPackageService: ActivityPackageService,
  ) {}

  entityToLine(entity: ActivityRegistrationEntry): ActivityRegistrationEntryLine {
    return {
      index: entity.entry_index,
      entry_code: entity.entry_code,
      package_id: Number(entity.package_id),
      quantity: Number(entity.quantity) || 1,
      unit_price: Number(entity.unit_price),
      line_total: Number(entity.line_total),
      checked_out_at: this.toIsoOrNull(entity.checked_out_at),
      checked_out_by_user_id: entity.checked_out_by_user_id,
      checked_out_by_name: entity.checked_out_by_name,
      checkout_requested_at: this.toIsoOrNull(entity.checkout_requested_at),
      checkout_request_note: entity.checkout_request_note,
      checkout_request_email_sent_at: this.toIsoOrNull(
        entity.checkout_request_email_sent_at,
      ),
      checkout_remark: entity.checkout_remark,
    };
  }

  async findLinesByRegistrationId(
    registrationId: number,
  ): Promise<ActivityRegistrationEntryLine[]> {
    const rows = await this.entryRepository.find({
      where: { registration_id: registrationId },
      order: { id: 'ASC' },
    });
    return rows.map((row) => this.entityToLine(row));
  }

  async findLinesMapByRegistrationIds(
    registrationIds: number[],
  ): Promise<Map<number, ActivityRegistrationEntryLine[]>> {
    const map = new Map<number, ActivityRegistrationEntryLine[]>();
    const unique = [...new Set(registrationIds.filter((id) => id > 0))];
    if (!unique.length) return map;

    for (const id of unique) {
      map.set(id, []);
    }

    const rows = await this.entryRepository.find({
      where: { registration_id: In(unique) },
      order: { registration_id: 'ASC', id: 'ASC' },
    });
    for (const row of rows) {
      map.get(row.registration_id)!.push(this.entityToLine(row));
    }

    return map;
  }

  async resolveLinesForRegistration(
    registration: ActivityRegistration,
  ): Promise<ActivityRegistrationEntryLine[]> {
    return this.findLinesByRegistrationId(registration.id);
  }

  async findEntryEntity(
    registrationId: number,
    entryIndex: string,
  ): Promise<ActivityRegistrationEntry | null> {
    const target = entryIndex.trim();
    if (!target) return null;
    return this.entryRepository.findOne({
      where: { registration_id: registrationId, entry_index: target },
    });
  }

  async requireEntryEntity(
    registration: ActivityRegistration,
    entryIndex: string,
  ): Promise<ActivityRegistrationEntry> {
    const entry = await this.findEntryEntity(registration.id, entryIndex);
    if (!entry) {
      throw new NotFoundException('ไม่พบรายการตามเลขลำดับที่ระบุ');
    }
    return entry;
  }

  async createLines(
    registrationId: number,
    lines: ActivityRegistrationEntryLine[],
  ): Promise<void> {
    if (!lines.length) return;
    await this.entryRepository.save(
      lines.map((line) =>
        this.entryRepository.create(this.lineToEntity(registrationId, line)),
      ),
    );
  }

  async replaceLines(
    registrationId: number,
    lines: ActivityRegistrationEntryLine[],
  ): Promise<void> {
    await this.entryRepository.delete({ registration_id: registrationId });
    if (lines.length) {
      await this.entryRepository.save(
        lines.map((line) =>
          this.entryRepository.create(this.lineToEntity(registrationId, line)),
        ),
      );
    }
  }

  async updateEntry(
    registration: ActivityRegistration,
    entryIndex: string,
    updater: (
      line: ActivityRegistrationEntryLine,
    ) => ActivityRegistrationEntryLine,
  ): Promise<ActivityRegistrationEntryLine[]> {
    const target = entryIndex.trim();
    if (!target) {
      throw new BadRequestException('กรุณาระบุ entry_index');
    }

    const entry = await this.findEntryEntity(registration.id, target);
    if (!entry) {
      throw new BadRequestException('ไม่พบรายการตามเลขลำดับที่ระบุ');
    }

    const updatedLine = updater(this.entityToLine(entry));
    Object.assign(entry, this.lineToEntity(registration.id, updatedLine));
    await this.entryRepository.save(entry);

    return this.findLinesByRegistrationId(registration.id);
  }

  /**
   * นับเฉพาะเลขลำดับของรายการที่ชำระเงินแล้ว — ไม่นับคำขอที่ยังรออนุมัติ
   */
  async getMaxEntryIndexForActivity(activityId: number): Promise<number> {
    const row = await this.entryRepository
      .createQueryBuilder('ent')
      .innerJoin(
        ActivityRegistration,
        'reg',
        'reg.id = ent.registration_id AND reg.activity_id = :activityId',
        { activityId },
      )
      .innerJoin(
        Order,
        'o',
        'o.refer_id = reg.id AND o.type = :otype AND o.status = :paid',
        { otype: OrderType.ACTIVITY_REGISTRATION, paid: OrderStatus.PAID },
      )
      .where('ent.entry_index IS NOT NULL')
      .andWhere("ent.entry_index <> ''")
      .select('MAX(CAST(ent.entry_index AS UNSIGNED))', 'max_index')
      .getRawOne<{ max_index: string | null }>();

    return Number(row?.max_index ?? 0);
  }

  /**
   * กำหนดเลขลำดับกิจกรรมและ entry_code เมื่ออนุมัติการชำระเงินแล้ว (idempotent)
   */
  async assignActivityWideEntryIndicesForRegistration(
    registrationId: number,
  ): Promise<void> {
    await this.entryRepository.manager.transaction(async (manager) => {
      const entryRepo = manager.getRepository(ActivityRegistrationEntry);
      const regRepo = manager.getRepository(ActivityRegistration);
      const activityRepo = manager.getRepository(Activity);

      const registration = await regRepo.findOne({
        where: { id: registrationId },
      });
      if (!registration) return;

      const entries = await entryRepo.find({
        where: { registration_id: registrationId },
        order: { id: 'ASC' },
      });
      const pending = entries.filter((row) => !String(row.entry_index ?? '').trim());
      if (!pending.length) return;

      await activityRepo.findOne({
        where: { id: registration.activity_id },
        lock: { mode: 'pessimistic_write' },
      });

      const maxIndex = await this.getMaxEntryIndexForActivityInTransaction(
        manager,
        registration.activity_id,
      );
      const formattedIndices = allocateFormattedActivityEntryIndices(
        maxIndex + 1,
        pending.length,
      );

      const packageIds = [
        ...new Set(pending.map((row) => Number(row.package_id))),
      ];
      const slugPaths =
        await this.activityPackageService.findSlugPathFromLayer2ByLeafIds(
          packageIds,
        );

      for (let i = 0; i < pending.length; i++) {
        const entry = pending[i]!;
        const idxStr = formattedIndices[i]!;
        entry.entry_index = idxStr;
        entry.entry_code = buildActivityRegistrationEntryCode(
          slugPaths.get(Number(entry.package_id)) ?? null,
          idxStr,
        );
      }

      await entryRepo.save(pending);
    });
  }

  async findPendingCheckoutEmailJobs(
    limit: number,
  ): Promise<{ registrationId: number; entryIndex: string }[]> {
    const rows = await this.entryRepository
      .createQueryBuilder('ent')
      .innerJoin(ActivityRegistration, 'reg', 'reg.id = ent.registration_id')
      .innerJoin(
        Order,
        'o',
        'o.refer_id = reg.id AND o.type = :otype AND o.status = :paid',
        { otype: OrderType.ACTIVITY_REGISTRATION, paid: OrderStatus.PAID },
      )
      .where('reg.checked_in_at IS NOT NULL')
      .andWhere('ent.entry_index IS NOT NULL')
      .andWhere("ent.entry_index <> ''")
      .andWhere('ent.checkout_requested_at IS NOT NULL')
      .andWhere('ent.checkout_request_email_sent_at IS NULL')
      .andWhere('ent.checked_out_at IS NULL')
      .orderBy('ent.updated_at', 'ASC')
      .select([
        'ent.registration_id AS registration_id',
        'ent.entry_index AS entry_index',
      ])
      .limit(limit)
      .getRawMany<{ registration_id: number; entry_index: string }>();

    return rows.map((row) => ({
      registrationId: Number(row.registration_id),
      entryIndex: String(row.entry_index),
    }));
  }

  private async getMaxEntryIndexForActivityInTransaction(
    manager: EntityManager,
    activityId: number,
  ): Promise<number> {
    const row = await manager
      .getRepository(ActivityRegistrationEntry)
      .createQueryBuilder('ent')
      .innerJoin(
        ActivityRegistration,
        'reg',
        'reg.id = ent.registration_id AND reg.activity_id = :activityId',
        { activityId },
      )
      .innerJoin(
        Order,
        'o',
        'o.refer_id = reg.id AND o.type = :otype AND o.status = :paid',
        { otype: OrderType.ACTIVITY_REGISTRATION, paid: OrderStatus.PAID },
      )
      .where('ent.entry_index IS NOT NULL')
      .andWhere("ent.entry_index <> ''")
      .select('MAX(CAST(ent.entry_index AS UNSIGNED))', 'max_index')
      .getRawOne<{ max_index: string | null }>();

    return Number(row?.max_index ?? 0);
  }

  private lineToEntity(
    registrationId: number,
    line: ActivityRegistrationEntryLine,
  ): Partial<ActivityRegistrationEntry> {
    const index = line.index?.trim() || null;
    return {
      registration_id: registrationId,
      entry_index: index,
      entry_code: line.entry_code ?? null,
      package_id: line.package_id,
      quantity: line.quantity,
      unit_price: line.unit_price,
      line_total: line.line_total,
      checked_out_at: this.toDateOrNull(line.checked_out_at),
      checked_out_by_user_id:
        line.checked_out_by_user_id != null
          ? Number(line.checked_out_by_user_id)
          : null,
      checked_out_by_name: line.checked_out_by_name ?? null,
      checkout_requested_at: this.toDateOrNull(line.checkout_requested_at),
      checkout_request_note: line.checkout_request_note ?? null,
      checkout_request_email_sent_at: this.toDateOrNull(
        line.checkout_request_email_sent_at,
      ),
      checkout_remark: line.checkout_remark ?? null,
    };
  }

  private toIsoOrNull(value: Date | string | null | undefined): string | null {
    if (value == null) return null;
    if (value instanceof Date) return value.toISOString();
    const s = String(value).trim();
    return s || null;
  }

  private toDateOrNull(value: string | null | undefined): Date | null {
    if (value == null || String(value).trim() === '') return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
}
