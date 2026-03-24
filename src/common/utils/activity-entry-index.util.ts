/** ความยาวขั้นต่ำของเลขลำดับรายการสมัคร (เช่น 0001); ถ้าเลขจริงยาวกว่าให้คงรูปแบบตัวเลขเต็ม */
const MIN_INDEX_DIGITS = 4;

/**
 * จัดรูปเลขลำดับรายการสมัครต่อกิจกรรม (อย่างน้อย 4 หลัก)
 */
export function formatActivityEntryIndex(n: number): string {
  if (!Number.isFinite(n) || n < 1) {
    throw new RangeError('activity entry index must be a positive integer');
  }
  const s = String(Math.floor(n));
  return s.length >= MIN_INDEX_DIGITS ? s : s.padStart(MIN_INDEX_DIGITS, '0');
}

/**
 * อ่านค่า index จาก JSON (รองรับทั้ง string และ number)
 */
export function parseActivityEntryIndex(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string') {
    const t = value.trim();
    if (!/^\d+$/.test(t)) return null;
    const n = parseInt(t, 10);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

/**
 * หาเลขลำดับสูงสุดจากอาร์เรย์รายการที่ parse จาก entries_json แล้ว
 */
export function maxNumericIndexFromParsedEntries(entries: unknown): number {
  if (!Array.isArray(entries)) return 0;
  let max = 0;
  for (const row of entries) {
    if (row && typeof row === 'object' && 'index' in row) {
      const n = parseActivityEntryIndex((row as Record<string, unknown>).index);
      if (n !== null && n > max) max = n;
    }
  }
  return max;
}

/**
 * สร้างเลขลำดับแบบจัดรูปต่อเนื่อง จำนวน count รายการ เริ่มที่ start (รวม)
 */
export function allocateFormattedActivityEntryIndices(
  start: number,
  count: number,
): string[] {
  if (!Number.isFinite(start) || start < 1) {
    throw new RangeError('start must be a positive integer');
  }
  if (!Number.isFinite(count) || count < 0 || !Number.isInteger(count)) {
    throw new RangeError('count must be a non-negative integer');
  }
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(formatActivityEntryIndex(start + i));
  }
  return out;
}
