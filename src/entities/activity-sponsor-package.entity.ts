import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('activity_sponsor_packages')
export class ActivitySponsorPackage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  activity_id: number;

  @Column({ type: 'int' })
  sponsor_package_id: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

