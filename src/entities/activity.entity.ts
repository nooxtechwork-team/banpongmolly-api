import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

export enum ActivityStatus {
  DRAFT = 'draft',
  OPEN = 'open',
  CLOSED = 'closed',
  FINISHED = 'finished',
}

@Entity('activities')
export class Activity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  organizer_id: number | null;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 255 })
  slug: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  cover_image: string | null;

  /** แบนเนอร์แสดงที่หน้า Detail ข้างบน (แยกจากหน้าปกที่ใช้กับการ์ด) */
  @Column({ type: 'varchar', length: 512, nullable: true })
  banner_image: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  detail_infographic_url: string | null;

  /**
   * จังหวัดที่จัดกิจกรรม (เชื่อมกับตาราง provinces)
   */
  @Column({ type: 'int', nullable: true })
  province_id: number | null;

  @Column({ type: 'date' })
  start_date: Date;

  @Column({ type: 'date' })
  end_date: Date;

  @Column({ type: 'time' })
  start_time: string;

  @Column({ type: 'time' })
  end_time: string;

  @Column({ type: 'datetime', nullable: true })
  registration_open_at: Date | null;

  @Column({ type: 'datetime', nullable: true })
  registration_deadline: Date | null;

  @Column({ type: 'varchar', length: 255 })
  location_name: string;

  @Column({ type: 'text', nullable: true })
  location_address: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  location_google_maps_url: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  location_latitude: number | null;

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  location_longitude: number | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  contact_info: string | null;

  @Column({ type: 'int', nullable: true })
  activity_package_id: number | null;

  @Column({ type: 'int', default: 0 })
  max_participants: number;

  @Column({
    type: 'enum',
    enum: ActivityStatus,
    default: ActivityStatus.DRAFT,
  })
  status: ActivityStatus;

  @Column({ type: 'boolean', default: false })
  is_featured_homepage: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date | null;
}
