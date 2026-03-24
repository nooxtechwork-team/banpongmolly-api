/**
 * รหัสแสดงรายการสมัคร เช่น AB0001 = อักษรจาก slug แม่ + อักษรจาก slug ลูก + เลข index (4 หลักขึ้นไป)
 */

export function firstCodeLetterFromSlug(
  slug: string | null | undefined,
): string {
  const t = (slug ?? '').trim();
  if (!t) return 'X';
  const ch = t[0]!;
  if (/[a-zA-Z]/.test(ch)) return ch.toUpperCase();
  return ch;
}

/** ใช้เมื่อไม่มีแพ็กเกจแม่: อักษรที่สองจาก slug ลูก */
export function secondCodeLetterFromLeafSlug(
  leafSlug: string | null | undefined,
): string {
  const t = (leafSlug ?? '').trim();
  if (t.length < 2) return 'X';
  const ch = t[1]!;
  if (/[a-zA-Z]/.test(ch)) return ch.toUpperCase();
  return ch;
}

export function buildActivityRegistrationEntryCode(
  parentSlug: string | null | undefined,
  leafSlug: string,
  indexDigits: string,
): string {
  const idx = (indexDigits || '').trim() || '0000';
  const leaf = (leafSlug || '').trim();
  if (!leaf) return `XX${idx}`;
  const ps = (parentSlug ?? '').trim();
  if (ps) {
    return `${firstCodeLetterFromSlug(ps)}${firstCodeLetterFromSlug(leaf)}${idx}`;
  }
  return `${firstCodeLetterFromSlug(leaf)}${secondCodeLetterFromLeafSlug(leaf)}${idx}`;
}
