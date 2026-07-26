import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum CheckoutDeviceStatus {
  ONLINE_IDLE = 'online_idle',
  ONLINE_BUSY = 'online_busy',
  OFFLINE = 'offline',
}

@Entity('checkout_devices')
@Index('uq_checkout_device_code', ['device_code'], { unique: true })
@Index('uq_checkout_device_api_key', ['api_key'], { unique: true })
@Index('idx_checkout_device_activity', ['activity_id'])
export class CheckoutDevice {
  @PrimaryGeneratedColumn()
  id: number;

  /** null = ใช้ข้ามงานได้ */
  @Column({ type: 'int', nullable: true })
  activity_id: number | null;

  @Column({ type: 'varchar', length: 64 })
  device_code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  /** API key เฉพาะเครื่อง — header X-POS-Api-Key */
  @Column({ type: 'varchar', length: 80, nullable: true })
  api_key: string | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({
    type: 'enum',
    enum: CheckoutDeviceStatus,
    default: CheckoutDeviceStatus.OFFLINE,
  })
  status: CheckoutDeviceStatus;

  @Column({ type: 'int', nullable: true })
  current_ticket_id: number | null;

  /**
   * Heartbeat time as Unix epoch milliseconds (timezone-safe).
   * Do NOT use datetime here — MySQL DATETIME + TZ skew caused false reclaim in seconds.
   */
  @Column({ type: 'bigint', nullable: true })
  last_heartbeat_ms: string | null;

  /** @deprecated kept for backward compat / display; prefer last_heartbeat_ms */
  @Column({ type: 'datetime', precision: 6, nullable: true })
  last_heartbeat_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
