import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('activity_registration_entries')
@Index('uq_areg_entry_index', ['registration_id', 'entry_index'], {
  unique: true,
})
@Index('idx_areg_registration', ['registration_id'])
@Index('idx_areg_entry_code', ['entry_code'])
@Index('idx_areg_package', ['package_id'])
export class ActivityRegistrationEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  registration_id: number;

  @Column({ type: 'varchar', length: 32, nullable: true })
  entry_index: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  entry_code: string | null;

  @Column({ type: 'int' })
  package_id: number;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unit_price: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  line_total: number;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  checked_out_at: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  checked_in_at: Date | null;

  @Column({ type: 'int', nullable: true })
  checked_out_by_user_id: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  checked_out_by_name: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  checkout_requested_at: Date | null;

  @Column({ type: 'text', nullable: true })
  checkout_request_note: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  checkout_request_email_sent_at: Date | null;

  @Column({ type: 'text', nullable: true })
  checkout_remark: string | null;

  @Column({ type: 'tinyint', nullable: true, default: 0 })
  ready_to_checkout: boolean | null;

  /**
   * สถานะถ่ายรูปสภาพปลา (ทางเลือก — ไม่บังคับถ่ายทุกตัว/ทุก order)
   * เจ้าหน้าที่เลือกเองว่าจะถ่ายหรือตรวจตัวไหน · ค่าเริ่มต้น pending = ยังไม่ใช้ฟีเจอร์นี้กับตัวนั้น
   * pending | photographed (มีภาพรอคอนเฟิร์ม) | confirmed (ล็อกถาวรหลังกดยืนยัน)
   */
  @Column({
    type: 'varchar',
    length: 32,
    default: 'pending',
  })
  photo_status: 'pending' | 'photographed' | 'confirmed';

  /** มีค่าเฉพาะเมื่อกดยืนยันภาพของตัวนี้แล้ว (optional flow) */
  @Column({ type: 'datetime', precision: 6, nullable: true })
  photo_confirmed_at: Date | null;

  @Column({ type: 'int', nullable: true })
  photo_confirmed_by_user_id: number | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
