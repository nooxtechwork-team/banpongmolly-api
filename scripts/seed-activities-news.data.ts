import { ActivityStatus } from '../src/entities/activity.entity';
import { NewsCategory } from '../src/entities/news.entity';

export const SEED_SLUG_PREFIX = 'seed-demo-';

export const ACTIVITY_SEED_COUNT = 48;
export const NEWS_SEED_COUNT = 60;

export const ACTIVITY_TAG_POOL = [
  'มอลลี่',
  'ปลาสวยงาม',
  'งานประกวด',
  'สมัครออนไลน์',
  'ครอบครัว',
  'มือใหม่',
  'มืออาชีพ',
  'รางวัลเงินสด',
  'ถ่ายทอดสด',
  'จังหวัด',
];

export const VENUE_POOL = [
  'ศูนย์ประชุมจังหวัด',
  'โรงแรมแกรนด์ คอนเวนชัน',
  'อาคารอเนกประสงค์มหาวิทยาลัย',
  'ศูนย์การค้าเซ็นทรัล',
  'สวนสาธารณะกลางเมือง',
  'โรงเรียนประมงท้องถิ่น',
  'ศูนย์กีฬาและนันทนาการ',
  'ไลฟ์สไตล์ มอลล์',
  'ศูนย์รวมชุมชนบ้านปลา',
  'โรงแรมรีสอร์ทริมน้ำ',
];

export const ACTIVITY_TITLE_TEMPLATES = [
  'งานประกวดปลามอลลี่ {region} ครั้งที่ {n}',
  'มหกรรมปลาสวยงาม {region} {year}',
  'Banpong Molly Open {n} — {region}',
  'แข่งขันปลามอลลี่รุ่นใหญ่ {province}',
  'Molly Championship {region} {year}',
  'งานออมนิบัสปลาสวยงาม {province}',
  'ประกวดปลามอลลี่สายพันธุ์พรีเมียม {region}',
  'งานรวมพลคนรักปลามอลลี่ {province}',
];

export const REGION_POOL = [
  'ภาคกลาง',
  'ภาคเหนือ',
  'ภาคใต้',
  'ภาคอีสาน',
  'ภาคตะวันออก',
  'ภาคตะวันตก',
  'กรุงเทพและปริมณฑล',
];

export const NEWS_TITLE_TEMPLATES: Array<{
  category: NewsCategory;
  template: string;
}> = [
  { category: NewsCategory.ANNOUNCEMENT, template: 'ประกาศเปิดรับสมัคร {event}' },
  { category: NewsCategory.ANNOUNCEMENT, template: 'เลื่อนกำหนดการ {event} เป็นวันที่ {date}' },
  { category: NewsCategory.ANNOUNCEMENT, template: 'ประกาศผลการแข่งขัน {event}' },
  { category: NewsCategory.NEWS, template: 'สรุปไฮไลต์ {event} — ผู้ชนะเลิศและรางวัลพิเศษ' },
  { category: NewsCategory.NEWS, template: 'เคล็ดลับเลี้ยงปลามอลลี่ก่อนเข้าแข่งขัน ฉบับที่ {n}' },
  { category: NewsCategory.NEWS, template: 'Banpong Molly อัปเดตระบบสมัครออนไลน์รุ่นใหม่' },
  { category: NewsCategory.EVENT, template: 'พรีวิวงาน {event} สิ่งที่ต้องเตรียมก่อนวันแข่ง' },
  { category: NewsCategory.EVENT, template: 'ไฮไลต์บรรยากาศ {event} วันแรก' },
  { category: NewsCategory.EVENT, template: 'เปิดจองที่นั่งชมงาน {event} แล้ววันนี้' },
];

export const STATUS_ROTATION: ActivityStatus[] = [
  ActivityStatus.OPEN,
  ActivityStatus.OPEN,
  ActivityStatus.OPEN,
  ActivityStatus.CLOSED,
  ActivityStatus.FINISHED,
  ActivityStatus.FINISHED,
  ActivityStatus.OPEN,
  ActivityStatus.DRAFT,
];

export function pick<T>(items: T[], index: number): T {
  return items[index % items.length]!;
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function toDateTimeString(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export function buildActivityTitle(index: number, provinceName: string, year: number): string {
  const template = pick(ACTIVITY_TITLE_TEMPLATES, index);
  const region = pick(REGION_POOL, index + 3);
  const n = index + 1;
  return template
    .replace('{region}', region)
    .replace('{province}', provinceName)
    .replace('{year}', String(year))
    .replace('{n}', String(n));
}

export function buildNewsTitle(
  index: number,
  category: NewsCategory,
  eventTitle: string,
  dateLabel: string,
): string {
  const pool = NEWS_TITLE_TEMPLATES.filter((item) => item.category === category);
  const template = pick(pool.length ? pool : NEWS_TITLE_TEMPLATES, index).template;
  return template
    .replace('{event}', eventTitle)
    .replace('{date}', dateLabel)
    .replace('{n}', String(index + 1));
}

export function buildActivityDescription(title: string, provinceName: string): string {
  return `<p><strong>${title}</strong> จัดขึ้นที่จังหวัด${provinceName} โดยชุมชนคนรักปลามอลลี่และผู้จัดงาน Banpong Molly</p>
<p>รายละเอียดงาน:</p>
<ul>
  <li>ประกวดปลามอลลี่หลายคลาส แยกระดับมือใหม่และมืออาชีพ</li>
  <li>มุมนิทรรศการอุปกรณ์เลี้ยงปลาและสายพันธุ์พิเศษ</li>
  <li>กิจกรรมเสริมสำหรับครอบครัวและผู้เริ่มเลี้ยงปลา</li>
  <li>ถ่ายทอดสดบางรอบการแข่งขันผ่านช่องทางออนไลน์</li>
</ul>
<p>สมัครและชำระเงินผ่านระบบ Banpong Molly ได้ตลอด 24 ชั่วโมง</p>`;
}

export function buildNewsContent(title: string, excerpt: string): string {
  return `<p>${excerpt}</p>
<h2>${title}</h2>
<p>ทีมงาน Banpong Molly ขอแจ้งข้อมูลล่าสุดให้ผู้สนใจทราบ พร้อมอัปเดตรายละเอียดบนเว็บไซต์อย่างต่อเนื่อง</p>
<p>หากมีข้อสงสัย สามารถติดต่อทีมงานผ่านหน้า <em>ติดต่อเรา</em> หรือช่องทางโซเชียลมีเดียของโครงการได้</p>
<ul>
  <li>ตรวจสอบกำหนดการล่าสุดก่อนเดินทาง</li>
  <li>เตรียมเอกสารการสมัครให้ครบถ้วน</li>
  <li>ติดตามข่าวสารเพิ่มเติมในหมวดข่าวและประกาศ</li>
</ul>`;
}
