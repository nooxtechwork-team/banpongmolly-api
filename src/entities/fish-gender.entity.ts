import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Master data: เพศปลา (เช่น ตัวผู้ / ตัวเมีย) */
@Entity('fish_genders')
export class FishGender {
  @PrimaryGeneratedColumn()
  id: number;

  /** รหัสอ้างอิง เช่น male, female */
  @Column({ type: 'varchar', length: 32, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 128 })
  label: string;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
