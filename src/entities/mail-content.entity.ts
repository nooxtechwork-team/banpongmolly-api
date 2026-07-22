import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum MailContentToMode {
  ALL_USERS = 'all_users',
  MANUAL = 'manual',
}

export enum MailContentStatus {
  DRAFT = 'draft',
  QUEUED = 'queued',
  SENDING = 'sending',
  SENT = 'sent',
  FAILED = 'failed',
}

@Entity('mail_contents')
export class MailContent {
  @PrimaryGeneratedColumn()
  id: number;

  /** ชื่ออ้างอิงในแอดมิน (ไม่ใช่หัวข้ออีเมล) */
  @Column({ type: 'varchar', length: 191, nullable: true })
  name: string | null;

  @Column({ type: 'varchar', length: 255 })
  subject: string;

  @Column({ type: 'longtext' })
  content_html: string;

  @Column({ type: 'longtext', nullable: true })
  content_text: string | null;

  @Column({
    type: 'enum',
    enum: MailContentToMode,
    default: MailContentToMode.MANUAL,
  })
  to_mode: MailContentToMode;

  /** อีเมลปลายทางเมื่อ to_mode = manual (คั่นด้วย , ; หรือขึ้นบรรทัดใหม่) */
  @Column({ type: 'text', nullable: true })
  to_emails: string | null;

  /** สำเนาถึง (CC) */
  @Column({ type: 'text', nullable: true })
  cc_emails: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({
    type: 'enum',
    enum: MailContentStatus,
    default: MailContentStatus.DRAFT,
  })
  status: MailContentStatus;

  @Column({ type: 'int', default: 0 })
  recipient_count: number;

  @Column({ type: 'int', default: 0 })
  sent_count: number;

  @Column({ type: 'int', default: 0 })
  failed_count: number;

  /** เวอร์ชันการส่งล่าสุด (0 = ยังไม่เคยส่ง) — ใช้กัน job เก่าค้างในคิว */
  @Column({ type: 'int', default: 0 })
  current_send_round: number;

  @Column({ type: 'text', nullable: true })
  last_error: string | null;

  @Column({ type: 'int', nullable: true })
  created_by_user_id: number | null;

  @Column({ type: 'datetime', nullable: true })
  sent_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
