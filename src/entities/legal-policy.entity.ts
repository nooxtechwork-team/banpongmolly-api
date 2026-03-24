import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

export enum LegalPolicyType {
  TERMS_OF_SERVICE = 'terms_of_service',
  PRIVACY_POLICY = 'privacy_policy',
  COOKIE_POLICY = 'cookie_policy',
}

@Entity('legal_policies')
@Unique('UQ_legal_policy_type_version', ['policy_type', 'version'])
export class LegalPolicy {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: LegalPolicyType })
  policy_type: LegalPolicyType;

  /** เช่น 1.0, 2025-03-22 */
  @Column({ type: 'varchar', length: 32 })
  version: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  /** เนื้อหาแสดงหน้าเว็บ (แก้จากแอดมิน — ห้ามรับ HTML จากผู้ใช้ทั่วไป) */
  @Column({ type: 'longtext' })
  body_html: string;

  @Column({ type: 'datetime', precision: 6 })
  effective_at: Date;

  /** เวอร์ชันที่ใช้งานจริงต่อประเภท — มีได้ทีละหนึ่งแถวที่ is_active = 1 ต่อ policy_type */
  @Column({ type: 'boolean', default: false })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
