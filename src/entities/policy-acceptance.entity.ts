import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/** แหล่งที่มาของการยอมรับ (audit) */
export type PolicyAcceptanceSource =
  | 'signup'
  | 'activity_registration'
  | 'account_reaccept';

@Entity('policy_acceptances')
export class PolicyAcceptance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  user_id: number;

  /** ค่าเดียวกับ LegalPolicyType */
  @Column({ type: 'varchar', length: 64 })
  policy_type: string;

  @Column({ type: 'varchar', length: 32 })
  version: string;

  @Column({ type: 'varchar', length: 32, default: 'signup' })
  source: string;

  @Column({ type: 'int', nullable: true })
  related_registration_id: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip_address: string | null;

  @Column({ type: 'text', nullable: true })
  user_agent: string | null;

  @CreateDateColumn()
  accepted_at: Date;
}
