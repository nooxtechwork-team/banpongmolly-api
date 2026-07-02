import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ActivityRegistrationEntry } from './activity-registration-entry.entity';

export enum ActivityClassChangeRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  CANCELLED = 'cancelled',
  REJECTED = 'rejected',
}

@Entity('activity_class_change_requests')
@Index('idx_accr_registration_entry', ['registration_id', 'entry_index'])
@Index('idx_accr_entry_id', ['entry_id'])
@Index('idx_accr_status', ['status'])
export class ActivityClassChangeRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  registration_id: number;

  @Column({ type: 'int' })
  entry_id: number;

  @ManyToOne(() => ActivityRegistrationEntry, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'entry_id' })
  entry: ActivityRegistrationEntry;

  /** สำเนา entry_index จาก entry (สะดวก query / backward compat) */
  @Column({ type: 'varchar', length: 32 })
  entry_index: string;

  @Column({ type: 'int' })
  old_package_id: number;

  @Column({ type: 'int' })
  new_package_id: number;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'int' })
  requested_by_user_id: number;

  @Column({ type: 'datetime', precision: 6 })
  requested_at: Date;

  @Column({
    type: 'varchar',
    length: 20,
    default: ActivityClassChangeRequestStatus.PENDING,
  })
  status: ActivityClassChangeRequestStatus;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  resolved_at: Date | null;

  @Column({ type: 'int', nullable: true })
  resolved_by_user_id: number | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
