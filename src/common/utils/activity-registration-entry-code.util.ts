/**
 * รหัสแสดงรายการสมัครแบบใหม่:
 * concat slug ตั้งแต่ layer 2 ไปจนถึง leaf แล้วต่อด้วยเลข index
 * ตัวอย่าง: normal-a-a1 + 0001 => normal-a-a10001
 */
export function buildActivityRegistrationEntryCode(
  slugPathFromLayer2: string | null | undefined,
  indexDigits: string,
): string {
  const idx = (indexDigits || '').trim() || '0000';
  const path = (slugPathFromLayer2 ?? '').trim();
  if (!path) return `unknown-${idx}`;
  return `${path}-${idx}`;
}
