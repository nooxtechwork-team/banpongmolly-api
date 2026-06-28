import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('entry_popup_configs')
export class EntryPopupConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  /** เพิ่มทุกครั้งที่แอดมินบันทึก เพื่อให้ผู้ใช้ที่เคยปิดเห็นเวอร์ชันใหม่ */
  @Column({ type: 'int', default: 1 })
  content_version: number;

  @Column({ type: 'varchar', length: 512, nullable: true })
  image_url: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  link_url: string | null;

  /** all = ทุกคน, guests_only = เฉพาะผู้ที่ยังไม่ล็อกอิน */
  @Column({ type: 'varchar', length: 32, default: 'all' })
  audience: string;

  /** แสดงตัวเลือก "ไม่ต้องแสดงอีก" ใน popup */
  @Column({ type: 'boolean', default: false })
  show_dismiss_checkbox: boolean;

  /** ปิด popup (X / คลิกพื้นหลัง) แล้ถือว่าไม่แสดงอีกสำหรับเวอร์ชันนี้ */
  @Column({ type: 'boolean', default: true })
  dismiss_on_close: boolean;

  /** แสดงซ้ำหลังจากกี่วัน (null = ไม่แสดงซ้ำจนกว่าแอดมินจะอัปเดตเนื้อหา) */
  @Column({ type: 'int', nullable: true })
  reshow_after_days: number | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
