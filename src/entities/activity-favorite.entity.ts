import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('activity_favorites')
@Index('UQ_activity_favorites_user_activity', ['user_id', 'activity_id'], {
  unique: true,
})
export class ActivityFavorite {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'int' })
  activity_id: number;

  @CreateDateColumn()
  created_at: Date;
}
