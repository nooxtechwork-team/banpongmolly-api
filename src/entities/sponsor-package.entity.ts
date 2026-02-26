import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('sponsor_packages')
export class SponsorPackage {
  @PrimaryGeneratedColumn()
  id: number;

  /** รหัสแพ็กเกจ เช่น pkg_5000_supporter */
  @Column({ type: 'varchar', length: 64, unique: true })
  code: string;

  /** ชื่อแพ็กเกจ เช่น Supporter / Main Sponsor / Premium Sponsor */
  @Column({ type: 'varchar', length: 255 })
  name: string;

  /** ราคาแพ็กเกจ */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  /** ระดับ (ใช้คู่กับ sponsor_registrations.tier ถ้าต้องการ) */
  @Column({ type: 'varchar', length: 16 })
  tier: string;

  /** รายละเอียดเพิ่มเติม (สิทธิประโยชน์ ฯลฯ) */
  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** ใช้งานอยู่หรือไม่ */
  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

