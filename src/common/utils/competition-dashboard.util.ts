/**
 * โครงสร้าง Dashboard สรุปผลการแข่งขัน (เก็บเป็น JSON ใน activities.competition_dashboard_json)
 */
export interface CompetitionParticipantPayload {
  image_url?: string | null;
  fish_owner?: string;
  /** ชื่อเต็มแสดงใหญ่ (ถ้าว่างใช้ fish_owner) */
  display_name?: string;
  class_code?: string;
  /** senior | junior | '' */
  participant_type?: string;
  /** male | female | '' */
  sex?: string;
  rank?: number;
  /** เช่น division / รางวัล อันดับ 1 */
  reward?: string;
  /** บรรทัด badge เช่น CLASS A1 • DIVISION A (ว่างระบบประกอบจาก class_code + reward) */
  category_line?: string;
  /** ข้อความป้ายสถานะ เช่น ผ่านเข้ารอบ Division */
  qualifier_label?: string;
  /** คะแนนแสดงท้ายการ์ด */
  score?: string | number;
  /** ข้อความปุ่มอันดับ 1 (ว่าง = ↑ ขึ้น DIVISION) */
  promotion_cta?: string;
  /** สไตล์การ์ดแชมป์เฉพาะช่อง (v1–v4) */
  champion_card_style?: 'v1' | 'v2' | 'v3' | 'v4';
}

export interface CompetitionClassBlockPayload {
  /** slug / รหัสคลาสลูกสุด เช่น A, B */
  class_slug?: string;
  class_label?: string;
  ranks?: CompetitionParticipantPayload[];
}

export interface CompetitionDashboardPayload {
  enabled?: boolean;
  top_section_title?: string;
  /** v1–v4 หรือ rotate (สลับสไตล์ตามลำดับการ์ดแชมป์) */
  champion_card_variant?: 'v1' | 'v2' | 'v3' | 'v4' | 'rotate';
  champions?: CompetitionParticipantPayload[];
  class_blocks?: CompetitionClassBlockPayload[];
  show_rank_gift_icons?: boolean;
}

export function parseCompetitionDashboardJson(
  raw: string | null | undefined,
): CompetitionDashboardPayload | null {
  if (raw == null || !String(raw).trim()) return null;
  try {
    const v = JSON.parse(raw) as CompetitionDashboardPayload;
    if (!v || typeof v !== 'object') return null;
    return v;
  } catch {
    return null;
  }
}
