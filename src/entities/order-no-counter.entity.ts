import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * ตัวนับเลข order แบบ running ต่อ scope (เช่น activity:12)
 * ใช้สร้าง order_no รูปแบบ ORD{รหัสกิจกรรม}{running 4 หลัก}
 */
@Entity('order_no_counters')
export class OrderNoCounter {
  @PrimaryColumn({ name: 'scope_key', type: 'varchar', length: 64 })
  scope_key: string;

  /** เลข running ล่าสุดที่ออกไปแล้ว (ไม่ใช้ชื่อ last_value เพราะเป็นคำสงวนใน MySQL) */
  @Column({ name: 'seq_value', type: 'int', default: 0 })
  seq_value: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
