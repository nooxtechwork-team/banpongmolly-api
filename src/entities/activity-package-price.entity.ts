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
import { ActivityPackage } from './activity-package.entity';

@Entity('activity_package_prices')
export class ActivityPackagePrice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  package_id: number;

  @ManyToOne(() => ActivityPackage)
  @JoinColumn({ name: 'package_id' })
  package: ActivityPackage;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'tinyint', default: 1 })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date | null;
}
