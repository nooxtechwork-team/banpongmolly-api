import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('payment_configs')
export class PaymentConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 191, nullable: true })
  bank_name: string | null;

  @Column({ type: 'varchar', length: 191, nullable: true })
  bank_account_type: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  bank_account_no: string | null;

  @Column({ type: 'varchar', length: 191, nullable: true })
  bank_account_name: string | null;

  @Column({ type: 'text', nullable: true })
  payment_instructions: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  promptpay_qr_url: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
