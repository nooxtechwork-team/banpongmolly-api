import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('access_logs')
export class AccessLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 10 })
  method: string;

  @Column({ type: 'varchar', length: 255 })
  path: string;

  @Column({ type: 'int' })
  status_code: number;

  @Column({ type: 'int' })
  duration_ms: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  user_agent: string | null;

  @Column({ type: 'int', nullable: true })
  user_id: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  user_email: string | null;

  @Column({ type: 'json', nullable: true })
  request_headers: Record<string, unknown> | null;

  @Column({ type: 'json', nullable: true })
  request_query: Record<string, unknown> | null;

  @Column({ type: 'json', nullable: true })
  request_body: Record<string, unknown> | null;

  @Column({ type: 'json', nullable: true })
  response_headers: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;
}
