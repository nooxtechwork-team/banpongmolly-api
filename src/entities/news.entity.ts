import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum NewsCategory {
  NEWS = 'news',
  ANNOUNCEMENT = 'announcement',
  EVENT = 'event',
}

@Entity('news')
export class News {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 191, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 191 })
  title: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  excerpt: string | null;

  @Column({ type: 'longtext' })
  content: string;

  @Column({
    type: 'enum',
    enum: NewsCategory,
    default: NewsCategory.NEWS,
  })
  category: NewsCategory;

  @Column({ type: 'varchar', length: 512, nullable: true })
  thumbnail_url: string | null;

  @Column({ type: 'datetime', nullable: true })
  published_at: Date | null;

  @Column({ type: 'tinyint', default: 0 })
  is_published: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
