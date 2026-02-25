import { BadRequestException, Injectable } from '@nestjs/common';
import { writeFile, unlink } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { extname } from 'path';

const PUBLIC_DIR = join(process.cwd(), 'public');
const UPLOADS_DIR = 'uploads';

export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

/** โฟลเดอร์ย่อยที่ใช้ใน upload (events, organizers, activities ฯลฯ) */
export type UploadSubdir = string;

@Injectable()
export class UploadService {
  /**
   * เขียนไฟล์ที่อัปโหลดลงโฟลเดอร์ public/uploads/{subdir}
   * ใช้กับไฟล์จาก multer memoryStorage
   * @returns path สำหรับเก็บใน DB เช่น /uploads/activities/xxx.jpg
   */
  async saveFile(
    file: Express.Multer.File,
    subdir: UploadSubdir,
  ): Promise<string> {
    const dir = join(PUBLIC_DIR, UPLOADS_DIR, subdir);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const ext = extname(file.originalname) || '.jpg';
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
    const filePath = join(dir, filename);
    await writeFile(filePath, file.buffer);
    return `/${UPLOADS_DIR}/${subdir}/${filename}`;
  }

  /**
   * ลบไฟล์จาก path ที่เคยอัปโหลด (ขึ้นต้นด้วย /uploads/)
   * ถ้ากำหนด subdir จะลบเฉพาะ path ที่อยู่ภายใต้ /uploads/{subdir}/
   * ไม่ throw ถ้าไฟล์ไม่มีหรือลบไม่ได้
   */
  async deleteByPath(
    path: string | null | undefined,
    options?: { subdir?: UploadSubdir },
  ): Promise<void> {
    if (!path || !path.startsWith(`/${UPLOADS_DIR}/`)) return;
    if (
      options?.subdir &&
      !path.startsWith(`/${UPLOADS_DIR}/${options.subdir}/`)
    ) {
      return;
    }
    const fullPath = join(PUBLIC_DIR, path.replace(/^\//, ''));
    try {
      await unlink(fullPath);
    } catch {
      // ไฟล์ไม่มีหรือลบไม่ได้ ไม่ต้อง throw
    }
  }

  /**
   * ตรวจว่า path ถูกต้อง (ขึ้นต้นด้วย /uploads/{subdir}/) สำหรับใช้เก็บใน entity
   * ถ้ามีค่าแต่ไม่ตรงรูปแบบ throw BadRequest
   */
  requireUploadPath(
    value: string | null | undefined,
    subdir: UploadSubdir,
    fieldName: string,
  ): string | null {
    if (value === undefined || value === null || value === '') return null;
    const prefix = `/${UPLOADS_DIR}/${subdir}/`;
    if (value.startsWith(prefix)) return value;
    throw new BadRequestException(
      `${fieldName} ต้องเป็นรูปที่อัปโหลดผ่านระบบเท่านั้น (path ขึ้นต้นด้วย ${prefix})`,
    );
  }
}
