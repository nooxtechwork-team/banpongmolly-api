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

  @Column({ type: 'datetime', precision: 6, nullable: true })
  last_heartbeat_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
