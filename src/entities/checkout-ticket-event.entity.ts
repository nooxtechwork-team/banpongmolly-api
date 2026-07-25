import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { CheckoutTicketStatus } from './checkout-ticket.entity';

@Entity('checkout_ticket_events')
@Index('idx_checkout_ticket_event_ticket', ['ticket_id'])
export class CheckoutTicketEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  ticket_id: number;

  @Column({
    type: 'enum',
    enum: CheckoutTicketStatus,
    nullable: true,
  })
  from_status: CheckoutTicketStatus | null;

  @Column({
    type: 'enum',
    enum: CheckoutTicketStatus,
  })
  to_status: CheckoutTicketStatus;

  @Column({ type: 'int', nullable: true })
  actor_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  device_id: number | null;

  @Column({ type: 'text', nullable: true })
  meta_json: string | null;

  @CreateDateColumn()
  created_at: Date;
}
