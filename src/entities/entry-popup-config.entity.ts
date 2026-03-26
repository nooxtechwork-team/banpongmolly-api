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

  @Column({ type: 'varchar', length: 191, nullable: true })
  title: string | null;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  image_url: string | null;

  @Column({ type: 'varchar', length: 191, nullable: true })
  button_label: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  button_url: string | null;

  /** all = ทุกคน, guests_only = เฉพาะผู้ที่ยังไม่ล็อกอิน */
  @Column({ type: 'varchar', length: 32, default: 'all' })
  audience: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
