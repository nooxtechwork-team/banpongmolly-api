import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('contact_messages')
export class ContactMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  user_id: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ type: 'varchar', length: 191 })
  name: string;

  @Column({ type: 'varchar', length: 191 })
  email: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 255 })
  subject: string;

  @Column({ type: 'text' })
  message: string;

  @CreateDateColumn()
  created_at: Date;
}
