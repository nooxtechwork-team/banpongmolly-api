/**
 * รหัสแสดงรายการสมัครแบบใหม่:
 * concat slug จากแม่ไปลูก (ข้าม node ที่ไม่มี slug) แล้วต่อด้วยเลข index
 * ตัวอย่าง: A + A1 + O + 0001 => AA1O0001
 */
export function buildActivityRegistrationEntryCode(
  slugPath: string | null | undefined,
  indexDigits: string,
): string {
  const idx = (indexDigits || '').trim() || '0000';
  const path = (slugPath ?? '').trim();
  if (!path) return idx;
  return `${path}-${idx}`;
}
