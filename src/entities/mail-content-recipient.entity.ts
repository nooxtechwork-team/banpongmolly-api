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
import { MailContent } from './mail-content.entity';

export enum MailRecipientStatus {
  PENDING = 'pending',
  SENDING = 'sending',
  SENT = 'sent',
  FAILED = 'failed',
}

@Entity('mail_content_recipients')
@Index(['mail_content_id', 'status'])
@Index(['mail_content_id', 'email'], { unique: true })
export class MailContentRecipient {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  mail_content_id: number;

  @ManyToOne(() => MailContent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mail_content_id' })
  mail_content: MailContent;

  @Column({ type: 'varchar', length: 191 })
  email: string;

  @Column({
    type: 'enum',
    enum: MailRecipientStatus,
    default: MailRecipientStatus.PENDING,
  })
  status: MailRecipientStatus;

  @Column({ type: 'tinyint', default: 0 })
  attach_cc: boolean;

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'datetime', nullable: true })
  sent_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
