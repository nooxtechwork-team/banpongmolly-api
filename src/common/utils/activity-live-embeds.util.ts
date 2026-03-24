export type ActivityLiveEmbed = {
  title?: string;
  platform: 'youtube' | 'facebook' | 'tiktok' | 'instagram' | 'other';
  embed_url: string;
};

const PLATFORM_SET = new Set([
  'youtube',
  'facebook',
  'tiktok',
  'instagram',
  'other',
]);

/** โฮสต์ที่อนุญาตให้ใส่ใน iframe src (https เท่านั้น) */
function isAllowedEmbedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  const suffixes = [
    'youtube.com',
    'youtube-nocookie.com',
    'facebook.com',
    'tiktok.com',
    'instagram.com',
  ];
  if (h === 'player.tiktok.com') return true;
  return suffixes.some((s) => h === s || h.endsWith(`.${s}`));
}

export function sanitizeActivityEmbedUrl(raw: string): string | null {
  const t = (raw || '').trim();
  if (!t) return null;
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (!isAllowedEmbedHost(u.hostname)) return null;
  return u.href;
}

export function parseActivityLiveEmbedsJson(
  json: string | null | undefined,
): ActivityLiveEmbed[] {
  if (!json || !String(json).trim()) return [];
  try {
    const v = JSON.parse(json) as unknown;
    if (!Array.isArray(v)) return [];
    const out: ActivityLiveEmbed[] = [];
    for (const row of v) {
      if (!row || typeof row !== 'object') continue;
      const o = row as Record<string, unknown>;
      const embed_url = sanitizeActivityEmbedUrl(String(o.embed_url ?? ''));
      if (!embed_url) continue;
      const p = String(o.platform ?? 'other').toLowerCase();
      const platform = (PLATFORM_SET.has(p) ? p : 'other') as ActivityLiveEmbed['platform'];
      const titleRaw = o.title != null ? String(o.title).trim().slice(0, 120) : '';
      out.push({
        platform,
        embed_url,
        ...(titleRaw ? { title: titleRaw } : {}),
      });
    }
    return out.slice(0, 6);
  } catch {
    return [];
  }
}

export function serializeActivityLiveEmbeds(
  items: ActivityLiveEmbed[] | null | undefined,
): string {
  if (!items?.length) return '[]';
  const cleaned: ActivityLiveEmbed[] = [];
  for (const row of items.slice(0, 6)) {
    const embed_url = sanitizeActivityEmbedUrl(row.embed_url);
    if (!embed_url) continue;
    const p = String(row.platform || 'other').toLowerCase();
    const platform = (PLATFORM_SET.has(p) ? p : 'other') as ActivityLiveEmbed['platform'];
    const title = row.title?.trim().slice(0, 120);
    cleaned.push({
      platform,
      embed_url,
      ...(title ? { title } : {}),
    });
  }
  return JSON.stringify(cleaned);
}
