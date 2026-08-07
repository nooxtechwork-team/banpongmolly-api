import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('fish_photos')
@Index('uq_fish_photo_entry_slot', ['entry_id', 'slot_no'], { unique: true })
@Index('idx_fish_photo_entry', ['entry_id'])
export class FishPhoto {
  @PrimaryGeneratedColumn()
  id: number;

  /** FK → activity_registration_entries.id */
  @Column({ type: 'int' })
  entry_id: number;

  /** ลำดับภาพ 1–10 ต่อปลา 1 ตัว */
  @Column({ type: 'tinyint' })
  slot_no: number;

  /** path เช่น /uploads/fish-photos/{orderNo}/{entryCode}/xxx.jpg */
  @Column({ type: 'varchar', length: 512 })
  file_url: string;

  @Column({ type: 'datetime', precision: 6 })
  taken_at: Date;

  @Column({ type: 'int', nullable: true })
  taken_by_user_id: number | null;

  @CreateDateColumn()
  created_at: Date;
}
