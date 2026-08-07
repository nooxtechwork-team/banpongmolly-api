import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FishPhoto } from '../entities/fish-photo.entity';
import { ActivityRegistrationEntry } from '../entities/activity-registration-entry.entity';
import { ActivityRegistration } from '../entities/activity-registration.entity';
import { Activity } from '../entities/activity.entity';
import {
  Order,
  OrderStatus,
  OrderType,
} from '../entities/order.entity';
import { User } from '../entities/user.entity';
import {
  IMAGE_MIME_TYPES,
  UploadService,
} from '../upload/upload.service';

export const MAX_FISH_PHOTOS = 10;

export type FishPhotoStatus = 'pending' | 'photographed' | 'confirmed';

export interface FishPhotoItemDto {
  id: number;
  slot_no: number;
  file_url: string;
  taken_at: string;
  taken_by_user_id: number | null;
}

export interface FishEntryListItemDto {
  entry_id: number;
  entry_code: string;
  entry_index: string | null;
  sequence_no: number;
  package_id: number;
  photo_status: FishPhotoStatus;
  photo_count: number;
  photo_confirmed_at: string | null;
}

export interface OrderFishListDto {
  order_id: number;
  order_no: string;
  order_status: OrderStatus;
  registration_id: number;
  registration_no: string;
  applicant_name: string;
  farm_name: string | null;
  activity_id: number;
  activity_title: string;
  entries: FishEntryListItemDto[];
  confirmed_count: number;
  total_count: number;
  all_confirmed: boolean;
}

export interface FishDetailDto {
  entry_id: number;
  entry_code: string;
  entry_index: string | null;
  sequence_no: number;
  photo_status: FishPhotoStatus;
  photo_confirmed_at: string | null;
  order_no: string;
  order_id: number;
  registration_id: number;
  applicant_name: string;
  activity_id: number;
  activity_title: string;
  photos: FishPhotoItemDto[];
  max_photos: number;
  read_only: boolean;
}

export interface ActivityFishDashboardSummaryDto {
  activity_id: number;
  title: string;
  status: string;
  location_name: string;
  start_date: string;
  end_date: string;
  confirmed_fish_count: number;
  photo_count: number;
}

export interface ActivityFishDashboardItemDto {
  entry_id: number;
  entry_code: string;
  entry_index: string | null;
  package_id: number;
  photo_count: number;
  photo_confirmed_at: string | null;
  cover_url: string | null;
  order_no: string;
  order_id: number;
  registration_id: number;
  registration_no: string;
  applicant_name: string;
  farm_name: string | null;
  photos: FishPhotoItemDto[];
}

export interface ActivityFishDashboardDto {
  activity_id: number;
  title: string;
  status: string;
  location_name: string;
  start_date: string;
  end_date: string;
  confirmed_fish_count: number;
  photo_count: number;
  items: ActivityFishDashboardItemDto[];
}

@Injectable()
export class FishPhotoService {
  constructor(
    @InjectRepository(FishPhoto)
    private readonly photoRepository: Repository<FishPhoto>,
    @InjectRepository(ActivityRegistrationEntry)
    private readonly entryRepository: Repository<ActivityRegistrationEntry>,
    @InjectRepository(ActivityRegistration)
    private readonly registrationRepository: Repository<ActivityRegistration>,
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly uploadService: UploadService,
  ) {}

  /**
   * รายการกิจกรรมที่มีปลาที่ยืนยันภาพแล้ว (สำหรับ Admin Dashboard)
   */
  async listDashboardActivities(
    search?: string,
  ): Promise<ActivityFishDashboardSummaryDto[]> {
    const qb = this.activityRepository
      .createQueryBuilder('a')
      .innerJoin(
        ActivityRegistration,
        'r',
        'r.activity_id = a.id',
      )
      .innerJoin(
        ActivityRegistrationEntry,
        'e',
        'e.registration_id = r.id AND e.photo_status = :confirmed',
        { confirmed: 'confirmed' },
      )
      .leftJoin(FishPhoto, 'p', 'p.entry_id = e.id')
      .select('a.id', 'activity_id')
      .addSelect('a.title', 'title')
      .addSelect('a.status', 'status')
      .addSelect('a.location_name', 'location_name')
      .addSelect('a.start_date', 'start_date')
      .addSelect('a.end_date', 'end_date')
      .addSelect('COUNT(DISTINCT e.id)', 'confirmed_fish_count')
      .addSelect('COUNT(p.id)', 'photo_count')
      .groupBy('a.id')
      .addGroupBy('a.title')
      .addGroupBy('a.status')
      .addGroupBy('a.location_name')
      .addGroupBy('a.start_date')
      .addGroupBy('a.end_date')
      .orderBy('a.start_date', 'DESC');

    const q = (search || '').trim();
    if (q) {
      qb.andWhere(
        '(a.title LIKE :q OR a.location_name LIKE :q OR CAST(a.id AS CHAR) LIKE :q)',
        { q: `%${q}%` },
      );
    }

    const rows = await qb.getRawMany<{
      activity_id: number;
      title: string;
      status: string;
      location_name: string;
      start_date: string | Date;
      end_date: string | Date;
      confirmed_fish_count: string;
      photo_count: string;
    }>();

    return rows.map((r) => ({
      activity_id: Number(r.activity_id),
      title: r.title,
      status: r.status,
      location_name: r.location_name,
      start_date: this.toDateOnly(r.start_date),
      end_date: this.toDateOnly(r.end_date),
      confirmed_fish_count: Number(r.confirmed_fish_count) || 0,
      photo_count: Number(r.photo_count) || 0,
    }));
  }

  /**
   * Dashboard ปลาที่ยืนยันภาพแล้วในกิจกรรมนั้น
   */
  async getActivityDashboard(
    activityId: number,
    search?: string,
  ): Promise<ActivityFishDashboardDto> {
    const activity = await this.activityRepository.findOne({
      where: { id: activityId },
    });
    if (!activity) throw new NotFoundException('ไม่พบกิจกรรม');

    const qb = this.entryRepository
      .createQueryBuilder('e')
      .innerJoin(
        ActivityRegistration,
        'r',
        'r.id = e.registration_id AND r.activity_id = :activityId',
        { activityId },
      )
      .leftJoin(
        Order,
        'o',
        'o.refer_id = r.id AND o.type = :orderType',
        { orderType: OrderType.ACTIVITY_REGISTRATION },
      )
      .where('e.photo_status = :confirmed', { confirmed: 'confirmed' })
      .select([
        'e.id AS entry_id',
        'e.entry_code AS entry_code',
        'e.entry_index AS entry_index',
        'e.package_id AS package_id',
        'e.photo_confirmed_at AS photo_confirmed_at',
        'r.id AS registration_id',
        'r.registration_no AS registration_no',
        'r.applicant_name AS applicant_name',
        'r.farm_name AS farm_name',
        'o.id AS order_id',
        'o.order_no AS order_no',
      ])
      .orderBy('e.photo_confirmed_at', 'DESC')
      .addOrderBy('e.id', 'DESC');

    const q = (search || '').trim();
    if (q) {
      qb.andWhere(
        `(
          e.entry_code LIKE :q
          OR r.applicant_name LIKE :q
          OR r.farm_name LIKE :q
          OR r.registration_no LIKE :q
          OR o.order_no LIKE :q
        )`,
        { q: `%${q}%` },
      );
    }

    const rows = await qb.getRawMany<{
      entry_id: number;
      entry_code: string | null;
      entry_index: string | null;
      package_id: number;
      photo_confirmed_at: Date | string | null;
      registration_id: number;
      registration_no: string;
      applicant_name: string;
      farm_name: string | null;
      order_id: number | null;
      order_no: string | null;
    }>();

    const entryIds = rows.map((r) => Number(r.entry_id));
    const photosByEntry = new Map<number, FishPhoto[]>();
    if (entryIds.length) {
      const photos = await this.photoRepository
        .createQueryBuilder('p')
        .where('p.entry_id IN (:...ids)', { ids: entryIds })
        .orderBy('p.slot_no', 'ASC')
        .addOrderBy('p.id', 'ASC')
        .getMany();
      for (const photo of photos) {
        const list = photosByEntry.get(photo.entry_id) ?? [];
        list.push(photo);
        photosByEntry.set(photo.entry_id, list);
      }
    }

    const items: ActivityFishDashboardItemDto[] = rows.map((r) => {
      const photos = photosByEntry.get(Number(r.entry_id)) ?? [];
      const photoItems = photos.map((p) => this.toPhotoItem(p));
      return {
        entry_id: Number(r.entry_id),
        entry_code: r.entry_code ?? `ENTRY-${r.entry_id}`,
        entry_index: r.entry_index,
        package_id: Number(r.package_id),
        photo_count: photoItems.length,
        photo_confirmed_at: r.photo_confirmed_at
          ? new Date(r.photo_confirmed_at).toISOString()
          : null,
        cover_url: photoItems[0]?.file_url ?? null,
        order_no: r.order_no ?? '—',
        order_id: r.order_id != null ? Number(r.order_id) : 0,
        registration_id: Number(r.registration_id),
        registration_no: r.registration_no,
        applicant_name: r.applicant_name,
        farm_name: r.farm_name,
        photos: photoItems,
      };
    });

    const photoCount = items.reduce((s, i) => s + i.photo_count, 0);

    return {
      activity_id: activity.id,
      title: activity.title,
      status: activity.status,
      location_name: activity.location_name,
      start_date: this.toDateOnly(activity.start_date),
      end_date: this.toDateOnly(activity.end_date),
      confirmed_fish_count: items.length,
      photo_count: photoCount,
      items,
    };
  }

  /**
   * ค้นหา order จาก order_no หรือ registration_no แล้วคืนรายการปลารวมสถานะถ่ายภาพ
   */
  async getOrderFishList(code: string): Promise<OrderFishListDto> {
    const { order, registration, activity, entries } =
      await this.resolveOrderContext(code);

    const photosByEntry = await this.loadPhotoCounts(
      entries.map((e) => e.id),
    );

    const listItems: FishEntryListItemDto[] = entries.map((entry, idx) => {
      const photoCount = photosByEntry.get(entry.id) ?? 0;
      return {
        entry_id: entry.id,
        entry_code: entry.entry_code ?? `ENTRY-${entry.id}`,
        entry_index: entry.entry_index,
        sequence_no: idx + 1,
        package_id: entry.package_id,
        photo_status: entry.photo_status ?? 'pending',
        photo_count: photoCount,
        photo_confirmed_at: entry.photo_confirmed_at
          ? entry.photo_confirmed_at.toISOString()
          : null,
      };
    });

    const confirmedCount = listItems.filter(
      (e) => e.photo_status === 'confirmed',
    ).length;

    return {
      order_id: order.id,
      order_no: order.order_no,
      order_status: order.status,
      registration_id: registration.id,
      registration_no: registration.registration_no,
      applicant_name: registration.applicant_name,
      farm_name: registration.farm_name,
      activity_id: activity.id,
      activity_title: activity.title,
      entries: listItems,
      confirmed_count: confirmedCount,
      total_count: listItems.length,
      all_confirmed:
        listItems.length > 0 && confirmedCount === listItems.length,
    };
  }

  async getFishDetail(entryCode: string): Promise<FishDetailDto> {
    const entry = await this.findEntryByCode(entryCode);
    const { order, registration, activity } =
      await this.resolveFromEntry(entry);
    const photos = await this.listPhotos(entry.id);

    return this.toFishDetail(
      entry,
      photos,
      order,
      registration,
      activity,
    );
  }

  async getFishDetailById(entryId: number): Promise<FishDetailDto> {
    const entry = await this.entryRepository.findOne({
      where: { id: entryId },
    });
    if (!entry) throw new NotFoundException('ไม่พบรายการปลา');
    const { order, registration, activity } =
      await this.resolveFromEntry(entry);
    const photos = await this.listPhotos(entry.id);
    return this.toFishDetail(
      entry,
      photos,
      order,
      registration,
      activity,
    );
  }

  async uploadPhoto(
    entryId: number,
    file: Express.Multer.File,
    user: User,
  ): Promise<FishPhotoItemDto> {
    if (!file) throw new BadRequestException('ไม่พบไฟล์ที่อัปโหลด');
    if (
      !IMAGE_MIME_TYPES.includes(
        file.mimetype as (typeof IMAGE_MIME_TYPES)[number],
      )
    ) {
      throw new BadRequestException(
        'รองรับเฉพาะรูปภาพ (JPEG, PNG, GIF, WebP)',
      );
    }

    const entry = await this.requireWritableEntry(entryId);
    const existing = await this.photoRepository.count({
      where: { entry_id: entry.id },
    });
    if (existing >= MAX_FISH_PHOTOS) {
      throw new BadRequestException(
        `ถ่ายภาพได้สูงสุด ${MAX_FISH_PHOTOS} ภาพต่อปลา 1 ตัว`,
      );
    }

    const { order } = await this.resolveFromEntry(entry);
    const entryCode = this.safePathSegment(
      entry.entry_code ?? `entry-${entry.id}`,
    );
    const orderNo = this.safePathSegment(order.order_no);
    const subdir = `fish-photos/${orderNo}/${entryCode}`;
    const fileUrl = await this.uploadService.saveFile(file, subdir);

    const nextSlot =
      (await this.photoRepository
        .createQueryBuilder('p')
        .select('COALESCE(MAX(p.slot_no), 0)', 'max')
        .where('p.entry_id = :entryId', { entryId: entry.id })
        .getRawOne<{ max: string }>()
        .then((r) => Number(r?.max ?? 0))) + 1;

    const photo = this.photoRepository.create({
      entry_id: entry.id,
      slot_no: nextSlot,
      file_url: fileUrl,
      taken_at: new Date(),
      taken_by_user_id: user?.id ?? null,
    });
    const saved = await this.photoRepository.save(photo);

    if (entry.photo_status === 'pending') {
      entry.photo_status = 'photographed';
      await this.entryRepository.save(entry);
    }

    return this.toPhotoItem(saved);
  }

  async deletePhoto(
    entryId: number,
    photoId: number,
  ): Promise<{ deleted: true }> {
    const entry = await this.requireWritableEntry(entryId);
    const photo = await this.photoRepository.findOne({
      where: { id: photoId, entry_id: entry.id },
    });
    if (!photo) throw new NotFoundException('ไม่พบภาพ');

    await this.uploadService.deleteByPath(photo.file_url, {
      subdir: 'fish-photos',
    });
    await this.photoRepository.remove(photo);

    // re-sequence slot_no ให้ต่อเนื่อง
    const remaining = await this.photoRepository.find({
      where: { entry_id: entry.id },
      order: { slot_no: 'ASC', id: 'ASC' },
    });
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].slot_no !== i + 1) {
        remaining[i].slot_no = i + 1;
      }
    }
    if (remaining.length) {
      await this.photoRepository.save(remaining);
    }

    if (remaining.length === 0 && entry.photo_status !== 'confirmed') {
      entry.photo_status = 'pending';
      await this.entryRepository.save(entry);
    }

    return { deleted: true };
  }

  async confirmFish(
    entryId: number,
    user: User,
  ): Promise<FishDetailDto> {
    const entry = await this.requireWritableEntry(entryId);
    const photoCount = await this.photoRepository.count({
      where: { entry_id: entry.id },
    });
    if (photoCount < 1) {
      throw new BadRequestException(
        'ต้องมีอย่างน้อย 1 ภาพก่อนยืนยัน',
      );
    }
    if (photoCount > MAX_FISH_PHOTOS) {
      throw new BadRequestException(
        `จำนวนภาพเกิน ${MAX_FISH_PHOTOS} ภาพ`,
      );
    }

    entry.photo_status = 'confirmed';
    entry.photo_confirmed_at = new Date();
    entry.photo_confirmed_by_user_id = user?.id ?? null;
    await this.entryRepository.save(entry);

    return this.getFishDetailById(entry.id);
  }

  /**
   * ยืนยันทั้ง order — ยืนยันเฉพาะตัวที่มีภาพอย่างน้อย 1 และยังไม่ confirmed
   */
  async confirmOrder(
    orderNo: string,
    user: User,
  ): Promise<OrderFishListDto> {
    const list = await this.getOrderFishList(orderNo);
    const unconfirmedWithPhotos = list.entries.filter(
      (e) => e.photo_status !== 'confirmed' && e.photo_count >= 1,
    );
    if (unconfirmedWithPhotos.length === 0) {
      throw new BadRequestException(
        'ไม่มีปลาที่พร้อมยืนยัน (ต้องมีภาพอย่างน้อย 1 ภาพ)',
      );
    }

    for (const item of unconfirmedWithPhotos) {
      await this.confirmFish(item.entry_id, user);
    }

    return this.getOrderFishList(orderNo);
  }

  async getOrderGallery(orderNo: string): Promise<OrderFishListDto & {
    gallery: Array<FishEntryListItemDto & { photos: FishPhotoItemDto[] }>;
  }> {
    const list = await this.getOrderFishList(orderNo);
    const confirmed = list.entries.filter(
      (e) => e.photo_status === 'confirmed',
    );
    const gallery = await Promise.all(
      confirmed.map(async (item) => {
        const photos = await this.listPhotos(item.entry_id);
        return {
          ...item,
          photos: photos.map((p) => this.toPhotoItem(p)),
        };
      }),
    );
    return { ...list, gallery };
  }

  async getFishGallery(entryId: number): Promise<FishDetailDto> {
    const detail = await this.getFishDetailById(entryId);
    if (detail.photo_status !== 'confirmed') {
      throw new BadRequestException(
        'ดู Gallery ได้เฉพาะปลาที่ยืนยันถ่ายภาพแล้วเท่านั้น',
      );
    }
    return detail;
  }

  // ─── helpers ───────────────────────────────────────────────

  private async resolveOrderContext(code: string): Promise<{
    order: Order;
    registration: ActivityRegistration;
    activity: Activity;
    entries: ActivityRegistrationEntry[];
  }> {
    const raw = (code || '').toString().trim();
    if (!raw) throw new BadRequestException('กรุณาระบุเลข Order');
    const normalized = raw.startsWith('#') ? raw.slice(1) : raw;

    let order = await this.orderRepository.findOne({
      where: {
        order_no: normalized,
        type: OrderType.ACTIVITY_REGISTRATION,
      },
    });

    let registration: ActivityRegistration | null = null;

    if (order) {
      registration = await this.registrationRepository.findOne({
        where: { id: order.refer_id },
      });
    } else {
      registration = await this.registrationRepository.findOne({
        where: { registration_no: normalized },
      });
      if (registration) {
        order = await this.orderRepository.findOne({
          where: {
            refer_id: registration.id,
            type: OrderType.ACTIVITY_REGISTRATION,
          },
        });
      }
    }

    if (!order || !registration) {
      throw new NotFoundException(
        'ไม่พบ Order / การลงทะเบียนในระบบ',
      );
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('คำสั่งซื้อนี้ถูกยกเลิกแล้ว');
    }

    const activity = await this.activityRepository.findOne({
      where: { id: registration.activity_id },
    });
    if (!activity) throw new NotFoundException('ไม่พบกิจกรรมที่ผูกกับ Order');

    const entries = await this.entryRepository.find({
      where: { registration_id: registration.id },
      order: { id: 'ASC' },
    });

    return { order, registration, activity, entries };
  }

  private async resolveFromEntry(entry: ActivityRegistrationEntry): Promise<{
    order: Order;
    registration: ActivityRegistration;
    activity: Activity;
  }> {
    const registration = await this.registrationRepository.findOne({
      where: { id: entry.registration_id },
    });
    if (!registration) throw new NotFoundException('ไม่พบการลงทะเบียน');

    const order = await this.orderRepository.findOne({
      where: {
        refer_id: registration.id,
        type: OrderType.ACTIVITY_REGISTRATION,
      },
    });
    if (!order) throw new NotFoundException('ไม่พบ Order ของรายการนี้');

    const activity = await this.activityRepository.findOne({
      where: { id: registration.activity_id },
    });
    if (!activity) throw new NotFoundException('ไม่พบกิจกรรม');

    return { order, registration, activity };
  }

  private async findEntryByCode(
    entryCode: string,
  ): Promise<ActivityRegistrationEntry> {
    const raw = (entryCode || '').toString().trim();
    if (!raw) throw new BadRequestException('กรุณาระบุรหัสปลา');
    const entry = await this.entryRepository.findOne({
      where: { entry_code: raw },
    });
    if (!entry) throw new NotFoundException(`ไม่พบปลารหัส ${raw}`);
    return entry;
  }

  private async requireWritableEntry(
    entryId: number,
  ): Promise<ActivityRegistrationEntry> {
    const entry = await this.entryRepository.findOne({
      where: { id: entryId },
    });
    if (!entry) throw new NotFoundException('ไม่พบรายการปลา');
    if (entry.photo_status === 'confirmed') {
      throw new BadRequestException(
        'ยืนยันภาพแล้ว ไม่สามารถเพิ่ม/ลบ/แก้ไขภาพได้อีก',
      );
    }
    return entry;
  }

  private async listPhotos(entryId: number): Promise<FishPhoto[]> {
    return this.photoRepository.find({
      where: { entry_id: entryId },
      order: { slot_no: 'ASC', id: 'ASC' },
    });
  }

  private async loadPhotoCounts(
    entryIds: number[],
  ): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    if (!entryIds.length) return map;
    const rows = await this.photoRepository
      .createQueryBuilder('p')
      .select('p.entry_id', 'entry_id')
      .addSelect('COUNT(*)', 'cnt')
      .where('p.entry_id IN (:...ids)', { ids: entryIds })
      .groupBy('p.entry_id')
      .getRawMany<{ entry_id: number; cnt: string }>();
    for (const row of rows) {
      map.set(Number(row.entry_id), Number(row.cnt));
    }
    return map;
  }

  private toPhotoItem(photo: FishPhoto): FishPhotoItemDto {
    return {
      id: photo.id,
      slot_no: photo.slot_no,
      file_url: photo.file_url,
      taken_at: photo.taken_at.toISOString(),
      taken_by_user_id: photo.taken_by_user_id,
    };
  }

  private toFishDetail(
    entry: ActivityRegistrationEntry,
    photos: FishPhoto[],
    order: Order,
    registration: ActivityRegistration,
    activity: Activity,
  ): FishDetailDto {
    const sorted = [...photos].sort(
      (a, b) => a.slot_no - b.slot_no || a.id - b.id,
    );
    // sequence from sibling entries would need extra query; approximate by entry_index
    const sequenceNo = Number(entry.entry_index) || 1;
    return {
      entry_id: entry.id,
      entry_code: entry.entry_code ?? `ENTRY-${entry.id}`,
      entry_index: entry.entry_index,
      sequence_no: sequenceNo,
      photo_status: entry.photo_status ?? 'pending',
      photo_confirmed_at: entry.photo_confirmed_at
        ? entry.photo_confirmed_at.toISOString()
        : null,
      order_no: order.order_no,
      order_id: order.id,
      registration_id: registration.id,
      applicant_name: registration.applicant_name,
      activity_id: activity.id,
      activity_title: activity.title,
      photos: sorted.map((p) => this.toPhotoItem(p)),
      max_photos: MAX_FISH_PHOTOS,
      read_only: entry.photo_status === 'confirmed',
    };
  }

  private safePathSegment(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64);
  }

  private toDateOnly(value: string | Date): string {
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }
    const s = String(value || '');
    return s.length >= 10 ? s.slice(0, 10) : s;
  }
}
