import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import { unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PosApkRelease } from '../entities/pos-apk-release.entity';
import { PosApkSettings } from '../entities/pos-apk-settings.entity';

const STORAGE_SUBDIR = 'pos-apks';
const DOWNLOAD_TOKEN_PURPOSE = 'pos-apk-download';
const DOWNLOAD_TOKEN_TTL = '10m';
const MAX_FAILED_ATTEMPTS = 8;
const FAIL_WINDOW_MS = 15 * 60 * 1000;

type FailBucket = { count: number; resetAt: number };

@Injectable()
export class PosApkService {
  private readonly failByIp = new Map<string, FailBucket>();

  constructor(
    @InjectRepository(PosApkRelease)
    private readonly releaseRepo: Repository<PosApkRelease>,
    @InjectRepository(PosApkSettings)
    private readonly settingsRepo: Repository<PosApkSettings>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private storageRoot(): string {
    return join(process.cwd(), 'storage', STORAGE_SUBDIR);
  }

  private absolutePath(storedPath: string): string {
    // stored_path is like "pos-apks/filename.apk"
    return join(process.cwd(), 'storage', storedPath);
  }

  private async getOrCreateSettings(): Promise<PosApkSettings> {
    const existing = await this.settingsRepo.find({
      order: { id: 'ASC' },
      take: 1,
    });
    if (existing[0]) return existing[0];
    return this.settingsRepo.save(
      this.settingsRepo.create({ password_hash: null }),
    );
  }

  async getSettingsPublic(): Promise<{ has_password: boolean; updated_at: Date | null }> {
    const row = await this.getOrCreateSettings();
    return {
      has_password: Boolean(row.password_hash),
      updated_at: row.updated_at ?? null,
    };
  }

  async setPassword(password: string): Promise<{ has_password: boolean }> {
    const hash = await bcrypt.hash(password, 10);
    const row = await this.getOrCreateSettings();
    row.password_hash = hash;
    await this.settingsRepo.save(row);
    return { has_password: true };
  }

  async listReleases(): Promise<PosApkRelease[]> {
    return this.releaseRepo.find({
      order: { created_at: 'DESC' },
    });
  }

  async getActiveRelease(): Promise<PosApkRelease | null> {
    return this.releaseRepo.findOne({ where: { is_active: true } });
  }

  async getPublicMeta(): Promise<{
    available: boolean;
    has_password: boolean;
    version_name: string | null;
    file_size: number | null;
    updated_at: string | null;
    notes: string | null;
  }> {
    const settings = await this.getSettingsPublic();
    const active = await this.getActiveRelease();
    if (!active) {
      return {
        available: false,
        has_password: settings.has_password,
        version_name: null,
        file_size: null,
        updated_at: null,
        notes: null,
      };
    }
    return {
      available: true,
      has_password: settings.has_password,
      version_name: active.version_name,
      file_size: Number(active.file_size),
      updated_at: active.updated_at?.toISOString?.() ?? String(active.updated_at),
      notes: active.notes,
    };
  }

  async uploadRelease(
    file: Express.Multer.File,
    versionName: string,
    notes: string | null | undefined,
    userId: number | null,
  ): Promise<PosApkRelease> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('ไม่พบไฟล์ที่อัปโหลด');
    }
    const original = file.originalname || 'app.apk';
    if (!original.toLowerCase().endsWith('.apk')) {
      throw new BadRequestException('รองรับเฉพาะไฟล์ .apk');
    }
    const mime = (file.mimetype || '').toLowerCase();
    const allowedMime = [
      'application/vnd.android.package-archive',
      'application/octet-stream',
      'application/zip',
      'application/java-archive',
    ];
    if (mime && !allowedMime.includes(mime)) {
      throw new BadRequestException('ชนิดไฟล์ไม่ถูกต้อง (ต้องเป็น APK)');
    }

    const dir = this.storageRoot();
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.apk`;
    const storedRelative = `${STORAGE_SUBDIR}/${filename}`;
    const abs = this.absolutePath(storedRelative);
    await writeFile(abs, file.buffer);

    const hadActive = await this.releaseRepo.exist({ where: { is_active: true } });

    const entity = this.releaseRepo.create({
      version_name: versionName.trim(),
      original_filename: original,
      stored_path: storedRelative,
      file_size: file.size,
      checksum_sha256: checksum,
      is_active: !hadActive,
      notes: notes?.trim() || null,
      uploaded_by_user_id: userId,
    });
    return this.releaseRepo.save(entity);
  }

  async activate(id: number): Promise<PosApkRelease> {
    const release = await this.releaseRepo.findOne({ where: { id } });
    if (!release) throw new NotFoundException('ไม่พบเวอร์ชัน APK');

    await this.releaseRepo.manager.transaction(async (em) => {
      await em
        .createQueryBuilder()
        .update(PosApkRelease)
        .set({ is_active: false })
        .where('is_active = :active', { active: true })
        .execute();
      release.is_active = true;
      await em.save(release);
    });

    return release;
  }

  async remove(id: number): Promise<void> {
    const release = await this.releaseRepo.findOne({ where: { id } });
    if (!release) throw new NotFoundException('ไม่พบเวอร์ชัน APK');

    const total = await this.releaseRepo.count();
    if (release.is_active && total > 1) {
      throw new BadRequestException(
        'ตั้งเวอร์ชันอื่นเป็น active ก่อนลบตัวที่กำลังใช้งาน',
      );
    }

    const abs = this.absolutePath(release.stored_path);
    try {
      await unlink(abs);
    } catch {
      // ignore missing file
    }
    await this.releaseRepo.remove(release);
  }

  private assertNotRateLimited(ip: string) {
    const now = Date.now();
    const bucket = this.failByIp.get(ip);
    if (!bucket) return;
    if (now > bucket.resetAt) {
      this.failByIp.delete(ip);
      return;
    }
    if (bucket.count >= MAX_FAILED_ATTEMPTS) {
      throw new ForbiddenException(
        'ลองใส่รหัสผ่านผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่',
      );
    }
  }

  private recordFail(ip: string) {
    const now = Date.now();
    const bucket = this.failByIp.get(ip);
    if (!bucket || now > bucket.resetAt) {
      this.failByIp.set(ip, { count: 1, resetAt: now + FAIL_WINDOW_MS });
      return;
    }
    bucket.count += 1;
  }

  private clearFails(ip: string) {
    this.failByIp.delete(ip);
  }

  async unlock(
    password: string,
    ip: string,
  ): Promise<{ download_token: string; expires_in_sec: number; filename: string }> {
    this.assertNotRateLimited(ip);

    const settings = await this.getOrCreateSettings();
    if (!settings.password_hash) {
      throw new BadRequestException('ยังไม่ได้ตั้งรหัสผ่านดาวน์โหลด');
    }

    const ok = await bcrypt.compare(password, settings.password_hash);
    if (!ok) {
      this.recordFail(ip);
      throw new UnauthorizedException('รหัสผ่านไม่ถูกต้อง');
    }
    this.clearFails(ip);

    const active = await this.getActiveRelease();
    if (!active) {
      throw new NotFoundException('ยังไม่มี APK ที่เปิดให้ดาวน์โหลด');
    }

    const secret = this.configService.get<string>('JWT_SECRET');
    const token = await this.jwtService.signAsync(
      {
        purpose: DOWNLOAD_TOKEN_PURPOSE,
        releaseId: active.id,
      },
      {
        secret,
        expiresIn: DOWNLOAD_TOKEN_TTL,
      },
    );

    return {
      download_token: token,
      expires_in_sec: 600,
      filename: active.original_filename || `banpong-pos-${active.version_name}.apk`,
    };
  }

  async openDownloadStream(token: string): Promise<{
    stream: ReturnType<typeof createReadStream>;
    filename: string;
    size: number;
  }> {
    let payload: { purpose?: string; releaseId?: number };
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('ลิงก์ดาวน์โหลดหมดอายุหรือไม่ถูกต้อง');
    }

    if (payload.purpose !== DOWNLOAD_TOKEN_PURPOSE || !payload.releaseId) {
      throw new UnauthorizedException('โทเคนไม่ถูกต้อง');
    }

    const release = await this.releaseRepo.findOne({
      where: { id: payload.releaseId },
    });
    if (!release || !release.is_active) {
      throw new NotFoundException('ไม่พบไฟล์ APK ที่เปิดใช้งาน');
    }

    const abs = this.absolutePath(release.stored_path);
    if (!existsSync(abs)) {
      throw new NotFoundException('ไฟล์ APK หายจากเซิร์ฟเวอร์');
    }

    return {
      stream: createReadStream(abs),
      filename:
        release.original_filename ||
        `banpong-pos-${release.version_name}.apk`,
      size: Number(release.file_size),
    };
  }
}
