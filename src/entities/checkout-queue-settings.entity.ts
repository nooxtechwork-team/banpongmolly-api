import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * แถวเดียว — การตั้งค่าคิวคืนปลา / POS (admin แก้ได้)
 * ค่าเริ่มต้นตรงกับ constant เดิมใน CheckoutQueueService
 */
@Entity('checkout_queue_settings')
export class CheckoutQueueSettings {
  @PrimaryGeneratedColumn()
  id: number;

  /** ไม่มี heartbeat → ถือว่า offline (ยังไม่คืนคิว) — ms */
  @Column({ type: 'int', default: 60_000 })
  device_offline_ms: number;

  /** เครื่องเงียบนานเท่านี้ → คืนคิว preparing/ready กลับ waiting — ms */
  @Column({ type: 'int', default: 900_000 })
  ticket_reclaim_ms: number;

  /** รอบเช็คเครื่องหลับ — ms */
  @Column({ type: 'int', default: 15_000 })
  reclaim_interval_ms: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
