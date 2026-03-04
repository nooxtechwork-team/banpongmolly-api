import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('provinces')
export class Province {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  /**
   * รูปภาพประจำจังหวัด (ใช้แสดงบนหน้าแรก / หน้าอื่น ๆ)
   * เก็บเป็น URL หรือ path ภายในระบบ (เช่น /uploads/...)
   */
  @Column({ type: 'varchar', length: 512, nullable: true })
  image_url: string | null;

  /**
   * ให้แสดงใน section "กำลังมองหากิจกรรมแต่ละจังหวัด" หน้าแรกหรือไม่
   */
  @Column({ type: 'boolean', default: false })
  is_featured_homepage: boolean;
}
