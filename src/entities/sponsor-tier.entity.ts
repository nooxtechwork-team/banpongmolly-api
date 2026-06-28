import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('sponsor_tiers')
export class SponsorTierLookup {
  @PrimaryGeneratedColumn()
  id: number;

  /** รหัสอ้างอิง เช่น supporter, main, premium */
  @Column({ type: 'varchar', length: 32, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 128 })
  label_th: string;

  @Column({ type: 'varchar', length: 128 })
  label_en: string;

  /** emerald | sky | amber | primary | slate */
  @Column({ type: 'varchar', length: 16, default: 'slate' })
  color: string;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
