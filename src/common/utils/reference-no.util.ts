const ALPHANUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** ความยาวขั้นต่ำ/สูงสุดของรหัสกิจกรรมตัวอักษรใน order_no */
export const ORDER_ACTIVITY_CODE_MIN_LEN = 2;
export const ORDER_ACTIVITY_CODE_MAX_LEN = 3;

/** ความยาวขั้นต่ำของเลข running ใน order_no (เช่น 0001) */
const ORDER_RUNNING_DIGITS = 4;

/**
 * สร้างรหัสอ้างอิงรูปแบบ ตัวอักษรผสมตัวเลข
 * รูปแบบ: PREFIX + YYYYMMDD + ตัวสุ่ม 6 ตัว (เช่น AR20260225A1B2C3)
 * ใช้กับ registration_no / sponsor_no — ไม่ใช้กับ order_no อีกแล้ว
 */
export function generateReferenceNo(prefix: string): string {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const dateStr = `${y}${m}${d}`;
  let random = '';
  for (let i = 0; i < 6; i++) {
    random += ALPHANUM[Math.floor(Math.random() * ALPHANUM.length)];
  }
  return `${prefix}${dateStr}${random}`;
}

/**
 * ทำความสะอาดรหัสกิจกรรมสำหรับ order_no → ตัวพิมพ์ใหญ่ A–Z เท่านั้น
 * คืน null ถ้าว่างหลังทำความสะอาด
 */
export function normalizeOrderActivityCode(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const cleaned = String(raw)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  return cleaned || null;
}

/**
 * ตรวจว่ารหัสกิจกรรมใช้กับ order_no ได้ (2–3 ตัวอักษร A–Z)
 */
export function isValidOrderActivityCode(code: string): boolean {
  return (
    code.length >= ORDER_ACTIVITY_CODE_MIN_LEN &&
    code.length <= ORDER_ACTIVITY_CODE_MAX_LEN &&
    /^[A-Z]+$/.test(code)
  );
}

/**
 * จัดรูปเลข running ใน order_no (อย่างน้อย 4 หลัก)
 * เช่น 1 → "0001", 12 → "0012", 10000 → "10000"
 */
export function formatOrderRunningNo(seq: number): string {
  if (!Number.isFinite(seq) || seq < 1) {
    throw new RangeError('order running number must be a positive integer');
  }
  const s = String(Math.floor(seq));
  return s.length >= ORDER_RUNNING_DIGITS
    ? s
    : s.padStart(ORDER_RUNNING_DIGITS, '0');
}

/**
 * สร้าง order_no สำหรับหน้างานอ่านง่าย
 * รูปแบบ: ORD + รหัสกิจกรรม (A–Z 2–3 ตัว) + running (4 หลักขึ้นไป)
 * เช่น ORDBPM0001
 */
export function formatOrderNo(activityCode: string, seq: number): string {
  const code = normalizeOrderActivityCode(activityCode);
  if (!code || !isValidOrderActivityCode(code)) {
    throw new RangeError(
      'activity order code must be 2–3 English letters (A–Z)',
    );
  }
  return `ORD${code}${formatOrderRunningNo(seq)}`;
}

/** scope ของตัวนับ order ต่อกิจกรรม (คงที่ตาม activity id แม้เปลี่ยนรหัส) */
export function orderNoCounterScopeKey(activityId: number): string {
  if (!Number.isFinite(activityId) || activityId < 1) {
    throw new RangeError('activityId must be a positive integer');
  }
  return `activity:${Math.floor(activityId)}`;
}

/**
 * ดึงตัวอักษรจากชื่อ/slug เพื่อเสนอรหัสเริ่มต้น (ยาวสุด 3 ตัว)
 */
export function suggestOrderActivityCodeFromText(text: string): string | null {
  const letters = normalizeOrderActivityCode(text);
  if (!letters) return null;
  if (letters.length >= ORDER_ACTIVITY_CODE_MAX_LEN) {
    return letters.slice(0, ORDER_ACTIVITY_CODE_MAX_LEN);
  }
  if (letters.length >= ORDER_ACTIVITY_CODE_MIN_LEN) return letters;
  return null;
}

/** แปลง index → รหัส 3 ตัว AAA, AAB, … ZZZ */
export function orderActivityCodeFromIndex(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError('index must be a non-negative integer');
  }
  const base = LETTERS.length;
  let n = index;
  const chars = ['A', 'A', 'A'];
  for (let i = 2; i >= 0; i--) {
    chars[i] = LETTERS[n % base]!;
    n = Math.floor(n / base);
  }
  return chars.join('');
}
