import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('hero_banner_slides')
export class HeroBannerSlide {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ type: 'varchar', length: 512 })
  image_url: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  image_url_mobile: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  link_url: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  alt: string | null;

  @Column({ type: 'boolean', default: true })
  is_enabled: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
