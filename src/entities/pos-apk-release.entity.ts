import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('pos_apk_releases')
export class PosApkRelease {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64 })
  version_name: string;

  @Column({ type: 'varchar', length: 255 })
  original_filename: string;

  /** relative path under storage root, e.g. pos-apks/xxx.apk */
  @Column({ type: 'varchar', length: 512 })
  stored_path: string;

  @Column({ type: 'bigint' })
  file_size: number;

  @Column({ type: 'varchar', length: 64 })
  checksum_sha256: string;

  @Column({ type: 'boolean', default: false })
  is_active: boolean;

  @Column({ type: 'varchar', length: 512, nullable: true })
  notes: string | null;

  @Column({ type: 'int', nullable: true })
  uploaded_by_user_id: number | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
