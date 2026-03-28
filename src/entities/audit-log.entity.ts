import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export type AuditAction =
  | 'approve'
  | 'reject'
  | 'create'
  | 'edit'
  | 'delete'
  | 'submit';
export type AuditEntityType =
  | 'payment'
  | 'payment_sponsor'
  | 'check_in'
  | 'check_out'
  | 'event'
  | 'package'
  | 'user'
  | 'sponsor'
  | 'sponsor_package'
  | 'activity'
  | 'activity_package'
  | 'province'
  | 'organizer'
  | 'news'
  | 'banner'
  | 'banner_category'
  | 'banner_position'
  | 'banner_type'
  | 'banner_status';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50 })
  action: AuditAction;

  @Column({ type: 'varchar', length: 80 })
  entity_type: AuditEntityType;

  @Column({ type: 'int' })
  entity_id: number;

  @Column({ type: 'int', nullable: true })
  checker_user_id: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  checker_name: string | null;

  @Column({ type: 'datetime', nullable: true })
  checked_at: Date | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;
}
