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

  /**
   * อีเมลเจ้าหน้าที่รับแจ้งเมื่อผู้สมัครกดขอแจ้งเตือน checkout (คืนปลา) — ส่งโดยสคริปต์ cron
   * หลายที่อยู่: คั่นด้วย comma, semicolon หรือขึ้นบรรทัดใหม่
   */
  @Column({ type: 'text', nullable: true })
  checkout_request_notify_email: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
