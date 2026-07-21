import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type CompetitionDashboardEntryKind = 'champion' | 'rank';

@Entity('activity_competition_dashboard_entries')
@Index('idx_acd_entry_dashboard', ['dashboard_id'])
@Index('idx_acd_entry_kind', ['dashboard_id', 'kind', 'sort_order'])
@Index('idx_acd_entry_block', ['class_block_id'])
export class ActivityCompetitionDashboardEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  dashboard_id: number;

  /** champion | rank */
  @Column({ type: 'varchar', length: 16 })
  kind: CompetitionDashboardEntryKind;

  @Column({ type: 'int', nullable: true })
  class_block_id: number | null;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ type: 'varchar', length: 512, nullable: true })
  image_url: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  reward_image_url: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  class_reward_image_url: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  division_reward_image_url: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fish_owner: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  farm_name: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  display_name: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  class_code: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  participant_type: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  sex: string | null;

  @Column({ type: 'int', nullable: true, name: 'rank' })
  rank: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reward: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  category_line: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  qualifier_label: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  score: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  promotion_cta: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  champion_card_style: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
