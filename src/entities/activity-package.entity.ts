import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

@Entity('activity_packages')
export class ActivityPackage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  parent_id: number | null;

  @Column({ type: 'varchar', length: 191 })
  name: string;

  @Column({ type: 'varchar', length: 191, nullable: true })
  slug: string | null;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ type: 'tinyint', default: 1 })
  is_active: boolean;

  /** FK → fish_generations.id (รุ่น เช่น Senior/Junior) */
  @Column({ type: 'int', nullable: true })
  generation_id: number | null;

  /** FK → fish_genders.id (เพศ เช่น ตัวผู้/ตัวเมีย) */
  @Column({ type: 'int', nullable: true })
  gender_id: number | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date | null;
}
