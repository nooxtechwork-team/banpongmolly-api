import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('activity_registrations')
export class ActivityRegistration {
  @PrimaryGeneratedColumn()
  id: number;

  /** รหัสอ้างอิง (ตัวอักษรผสมตัวเลข) เช่น AR20260225A1B2C3 */
  @Column({
    name: 'registration_no',
    type: 'varchar',
    length: 32,
    unique: true,
  })
  registration_no: string;

  @Column({ type: 'int' })
  activity_id: number;

  @Column({ type: 'varchar', length: 255 })
  applicant_name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  farm_name: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 50 })
  phone: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  line: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  /**
   * JSON string: [{ package_id, quantity, unit_price, line_total }, ...]
   */
  @Column({ type: 'text' })
  entries_json: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total_amount: number;

  @Column({ type: 'varchar', length: 512, nullable: true })
  payment_slip: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  /** เวลาที่เช็คอิน (null = ยังไม่เช็คอิน) */
  @Column({ type: 'datetime', precision: 6, nullable: true })
  checked_in_at: Date | null;
}
