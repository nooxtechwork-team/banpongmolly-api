const ALPHANUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * สร้างรหัสอ้างอิงรูปแบบ ตัวอักษรผสมตัวเลข
 * รูปแบบ: PREFIX + YYYYMMDD + ตัวสุ่ม 6 ตัว (เช่น AR20260225A1B2C3)
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
