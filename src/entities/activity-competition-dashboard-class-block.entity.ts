import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('activity_competition_dashboard_class_blocks')
@Index('idx_acd_block_dashboard', ['dashboard_id'])
@Index('idx_acd_block_sort', ['dashboard_id', 'sort_order'])
export class ActivityCompetitionDashboardClassBlock {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  dashboard_id: number;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ type: 'varchar', length: 128, nullable: true })
  class_slug: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  class_label: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
