import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('checkout_ticket_items')
@Index('idx_checkout_ticket_item_ticket', ['ticket_id'])
@Index('idx_checkout_ticket_item_entry', ['entry_id'])
@Index('idx_checkout_ticket_item_registration', ['registration_id'])
export class CheckoutTicketItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  ticket_id: number;

  /** ใบสมัครของปลารายนี้ (แต่ละ item อาจคนละใบ) */
  @Column({ type: 'int' })
  registration_id: number;

  @Column({ type: 'int' })
  entry_id: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  entry_code: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  package_name: string | null;

  @CreateDateColumn()
  created_at: Date;
}
