import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum CheckoutTicketStatus {
  WAITING = 'waiting',
  PREPARING = 'preparing',
  READY = 'ready',
  COMPLETE = 'complete',
  CANCELLED = 'cancelled',
}

@Entity('checkout_tickets')
@Index('uq_checkout_ticket_queue', ['activity_id', 'queue_date', 'queue_no'], {
  unique: true,
})
@Index('idx_checkout_ticket_status', ['activity_id', 'status', 'queue_no'])
@Index('idx_checkout_ticket_user', ['user_id'])
@Index('idx_checkout_ticket_code', ['queue_code'])
export class CheckoutTicket {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  activity_id: number;

  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'int' })
  queue_no: number;

  /** YYYY-MM-DD (วันที่ออกคิว) */
  @Column({ type: 'date' })
  queue_date: string;

  /** snapshot เช่น A001 */
  @Column({ type: 'varchar', length: 32 })
  queue_code: string;

  @Column({
    type: 'enum',
    enum: CheckoutTicketStatus,
    default: CheckoutTicketStatus.WAITING,
  })
  status: CheckoutTicketStatus;

  @Column({ type: 'int', nullable: true })
  device_id: number | null;

  @Column({ type: 'int', nullable: true })
  staff_user_id: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  staff_name: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'text', nullable: true })
  cancel_reason: string | null;

  @Column({ type: 'datetime', precision: 6 })
  requested_at: Date;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  preparing_at: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  ready_at: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  completed_at: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  cancelled_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
