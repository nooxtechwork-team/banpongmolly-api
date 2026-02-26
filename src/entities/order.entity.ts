import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum OrderType {
  ACTIVITY_REGISTRATION = 'activity_registration',
  SPONSOR = 'sponsor_registration',
}

export enum OrderStatus {
  PENDING = 'pending',
  PAID = 'paid',
  CANCELLED = 'cancelled',
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  /** รหัสอ้างอิง (ตัวอักษรผสมตัวเลข) เช่น ORD20260225X9Y8Z7 */
  @Column({ name: 'order_no', type: 'varchar', length: 32, unique: true })
  order_no: string;

  @Column({ type: 'enum', enum: OrderType })
  type: OrderType;

  /**
   * อ้างอิง id ของ table ต้นทาง เช่น activity_registrations.id หรือ sponsor_registrations.id
   */
  @Column({ type: 'int' })
  refer_id: number;

  @Column({ type: 'varchar', length: 255 })
  customer_name: string;

  @Column({ type: 'varchar', length: 50 })
  customer_phone: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  customer_email: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total_amount: number;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  payment_ref: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
