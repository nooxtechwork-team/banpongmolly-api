import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum PrintJobType {
  QUEUE_TICKET = 'queue_ticket',
  FISH_RETURN = 'fish_return',
  RECEIPT = 'receipt',
  CUSTOM = 'custom',
}

export enum PrintJobStatus {
  PENDING = 'pending',
  CLAIMED = 'claimed',
  DONE = 'done',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Entity('print_jobs')
@Index(['status', 'created_at'])
@Index(['target_device_id', 'status'])
@Index(['job_type', 'created_at'])
export class PrintJob {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'enum',
    enum: PrintJobType,
    default: PrintJobType.QUEUE_TICKET,
  })
  job_type: PrintJobType;

  @Column({
    type: 'enum',
    enum: PrintJobStatus,
    default: PrintJobStatus.PENDING,
  })
  status: PrintJobStatus;

  /** Daily queue display number e.g. 1, 2, 3… */
  @Column({ type: 'int', nullable: true })
  queue_no: number | null;

  /** Formatted slip body for thermal printer */
  @Column({ type: 'text' })
  payload_text: string;

  /** Optional label shown on slip / UI (ชื่อลูกค้า, หมายเหตุสั้น ๆ) */
  @Column({ type: 'varchar', length: 191, nullable: true })
  label: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  target_device_id: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  claimed_by_device_id: string | null;

  @Column({ type: 'datetime', nullable: true })
  claimed_at: Date | null;

  @Column({ type: 'datetime', nullable: true })
  printed_at: Date | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'text', nullable: true })
  last_error: string | null;

  @Column({ type: 'int', nullable: true })
  created_by_user_id: number | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
