import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserAuth } from './user-auth.entity';
import { Province } from './province.entity';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 191, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 100 })
  fullname: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone_number: string | null;

  @Column({ type: 'varchar', length: 191, nullable: true })
  farm_name: string | null;

  @Column({ type: 'text', nullable: true })
  contact_address: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  line_id: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  avatar_url: string | null;

  @Column({ type: 'int', nullable: true })
  province_id: number | null;

  @ManyToOne(() => Province, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'province_id' })
  province: Province | null;

  @Column({ type: 'text', nullable: true })
  about_you: string | null;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @Column({ type: 'tinyint', default: 0 })
  is_verified: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  accepted_terms_at: Date | null;

  @Column({ type: 'varchar', length: 10, default: '1.0' })
  privacy_policy_version: string;

  /** เวอร์ชันข้อกำหนดและเงื่อนไขที่ผู้ใช้ยอมรับล่าสุด (อ้างอิง legal_policies.version) */
  @Column({ type: 'varchar', length: 32, default: '0' })
  terms_policy_version: string;

  @OneToMany(() => UserAuth, (userAuth) => userAuth.user)
  auths: UserAuth[];
}
