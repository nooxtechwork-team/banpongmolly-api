import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ActivityRegistrationEntry } from './activity-registration-entry.entity';
import { ActivityClassChangeRequest } from './activity-class-change-request.entity';

@Entity('activity_class_change_logs')
@Index('idx_accl_registration_entry', ['registration_id', 'entry_index'])
@Index('idx_accl_entry_id', ['entry_id'])
@Index('idx_accl_changed_at', ['changed_at'])
export class ActivityClassChangeLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  registration_id: number;

  @Column({ type: 'int' })
  entry_id: number;

  @ManyToOne(() => ActivityRegistrationEntry, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'entry_id' })
  entry: ActivityRegistrationEntry;

  /** สำเนา entry_index จาก entry */
  @Column({ type: 'varchar', length: 32 })
  entry_index: string;

  @Column({ type: 'int' })
  old_package_id: number;

  @Column({ type: 'int' })
  new_package_id: number;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'int' })
  changed_by_user_id: number;

  @Column({ type: 'datetime', precision: 6 })
  changed_at: Date;

  @Column({ type: 'int', nullable: true })
  request_id: number | null;

  @ManyToOne(() => ActivityClassChangeRequest, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'request_id' })
  request: ActivityClassChangeRequest | null;

  @CreateDateColumn()
  created_at: Date;
}
