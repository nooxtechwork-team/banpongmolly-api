import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Activity } from './activity.entity';

/** สถานะรางวัล: รอประกาศผล | ประกาศแล้ว */
export type RewardStatus = 'pending' | 'announced';

@Entity('activity_rewards')
export class ActivityReward {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  activity_id: number;

  @ManyToOne(() => Activity)
  @JoinColumn({ name: 'activity_id' })
  activity: Activity;

  /** ลำดับอันดับ 1=ชนะเลิศ, 2=รองอันดับ1, 3=รองอันดับ2 */
  @Column({ type: 'tinyint' })
  rank_order: number;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  /** รายละเอียดรางวัล เช่น "5,000 บาท + ถ้วยรางวัล" */
  @Column({ type: 'varchar', length: 512 })
  prize_description: string;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date | null;
}
