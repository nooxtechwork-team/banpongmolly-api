import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('activity_competition_dashboards')
@Index('uq_acd_activity', ['activity_id'], { unique: true })
@Index('idx_acd_activity', ['activity_id'])
export class ActivityCompetitionDashboard {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  activity_id: number;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  top_section_title: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true, default: 'rotate' })
  champion_card_variant: string | null;

  @Column({ type: 'boolean', default: true })
  show_rank_gift_icons: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
