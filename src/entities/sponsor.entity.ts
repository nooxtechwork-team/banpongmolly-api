import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SponsorTier = 'supporter' | 'main' | 'premium';

@Entity('sponsor_registrations')
export class SponsorRegistration {
  @PrimaryGeneratedColumn()
  id: number;

  /** โค้ดอ้างอิง เช่น SP20260225ABC123 */
  @Column({
    name: 'sponsor_no',
    type: 'varchar',
    length: 32,
    unique: true,
  })
  sponsor_no: string;

  /** อ้างอิงงานกิจกรรมที่สปอนเซอร์ */
  @Column({ type: 'int' })
  activity_id: number;

  /** ระดับแพ็กเกจ: supporter / main / premium */
  @Column({ type: 'varchar', length: 16 })
  tier: SponsorTier;

  /** ยอดแพ็กเกจ (เช่น 5000, 10000, 20000) */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  /** ชื่อผู้ติดต่อ */
  @Column({ type: 'varchar', length: 255 })
  contact_name: string;

  @Column({ type: 'varchar', length: 50 })
  contact_phone: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contact_email: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contact_line_id: string | null;

  /** ชื่อที่ให้แสดง (บริษัท / แบรนด์ / ทีม) */
  @Column({ type: 'varchar', length: 255 })
  brand_display_name: string;

  /** URL โลโก้ หรือ path ภายในระบบ */
  @Column({ type: 'varchar', length: 512, nullable: true })
  logo_url: string | null;

  /** ข้อมูลสำหรับออกใบเสร็จ/ใบกำกับภาษี */
  @Column({ type: 'varchar', length: 255, nullable: true })
  receipt_name: string | null;

  @Column({ type: 'text', nullable: true })
  receipt_address: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  tax_id: string | null;

  /**
   * ช่องทาง Social media ที่แสดงบนหน้าแรก
   * เก็บเป็น JSON string ของ array [{ type, label, url }]
   */
  @Column({ type: 'text', nullable: true })
  social_links_json: string | null;

  /**
   * ให้แสดงโลโก้/ชื่อบนหน้าแรกหรือไม่ (Admin เป็นคนเลือก)
   */
  @Column({ type: 'boolean', default: false })
  is_featured_homepage: boolean;

  /** หลักฐานการโอนเงิน (URL รูป/ไฟล์) */
  @Column({ type: 'varchar', length: 512, nullable: true })
  payment_slip: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
