import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Province } from '../entities/province.entity';
import { Activity } from '../entities/activity.entity';

const PROVINCE_NAMES = [
  'กรุงเทพมหานคร',
  'กระบี่',
  'กาญจนบุรี',
  'กาฬสินธุ์',
  'กำแพงเพชร',
  'ขอนแก่น',
  'จันทบุรี',
  'ฉะเชิงเทรา',
  'ชลบุรี',
  'ชัยนาท',
  'ชัยภูมิ',
  'ชุมพร',
  'เชียงราย',
  'เชียงใหม่',
  'ตรัง',
  'ตราด',
  'ตาก',
  'นครนายก',
  'นครปฐม',
  'นครพนม',
  'นครราชสีมา',
  'นครศรีธรรมราช',
  'นครสวรรค์',
  'นนทบุรี',
  'นราธิวาส',
  'น่าน',
  'บึงกาฬ',
  'บุรีรัมย์',
  'ปทุมธานี',
  'ประจวบคีรีขันธ์',
  'ปราจีนบุรี',
  'ปัตตานี',
  'พระนครศรีอยุธยา',
  'พังงา',
  'พัทลุง',
  'พิจิตร',
  'พิษณุโลก',
  'เพชรบุรี',
  'เพชรบูรณ์',
  'แพร่',
  'พะเยา',
  'ภูเก็ต',
  'มหาสารคาม',
  'มุกดาหาร',
  'แม่ฮ่องสอน',
  'ยโสธร',
  'ยะลา',
  'ร้อยเอ็ด',
  'ระนอง',
  'ระยอง',
  'ราชบุรี',
  'ลพบุรี',
  'ลำปาง',
  'ลำพูน',
  'เลย',
  'ศรีสะเกษ',
  'สกลนคร',
  'สงขลา',
  'สตูล',
  'สมุทรปราการ',
  'สมุทรสงคราม',
  'สมุทรสาคร',
  'สระแก้ว',
  'สระบุรี',
  'สิงห์บุรี',
  'สุโขทัย',
  'สุพรรณบุรี',
  'สุราษฎร์ธานี',
  'สุรินทร์',
  'หนองคาย',
  'หนองบัวลำภู',
  'อ่างทอง',
  'อุดรธานี',
  'อุทัยธานี',
  'อุบลราชธานี',
  'อำนาจเจริญ',
];

@Injectable()
export class ProvinceService implements OnModuleInit {
  constructor(
    @InjectRepository(Province)
    private readonly provinceRepository: Repository<Province>,
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
  ) {}

  async onModuleInit() {
    await this.seedIfEmpty();
  }

  private async seedIfEmpty(): Promise<void> {
    const count = await this.provinceRepository.count();
    if (count > 0) return;
    await this.provinceRepository.insert(
      PROVINCE_NAMES.map((name) => ({ name })),
    );
  }

  async findAll(): Promise<Province[]> {
    return this.provinceRepository.find({
      order: { name: 'ASC' },
    });
  }

  async findAllAdmin(): Promise<Province[]> {
    return this.provinceRepository.find({
      order: { name: 'ASC' },
    });
  }

  async createProvince(payload: {
    name: string;
    image_url?: string | null;
  }): Promise<Province> {
    const province = this.provinceRepository.create({
      name: payload.name.trim(),
      image_url: payload.image_url ?? null,
    });
    return this.provinceRepository.save(province);
  }

  async updateProvince(
    id: number,
    payload: {
      name?: string;
      image_url?: string | null;
    },
  ): Promise<Province> {
    const province = await this.provinceRepository.findOne({ where: { id } });
    if (!province) {
      throw new NotFoundException('ไม่พบจังหวัดที่ต้องการแก้ไข');
    }

    if (payload.name !== undefined) {
      province.name = payload.name.trim();
    }
    if (payload.image_url !== undefined) {
      province.image_url = payload.image_url ?? null;
    }

    return this.provinceRepository.save(province);
  }

  async deleteProvince(id: number): Promise<void> {
    const province = await this.provinceRepository.findOne({ where: { id } });
    if (!province) {
      throw new NotFoundException('ไม่พบจังหวัดที่ต้องการลบ');
    }
    await this.provinceRepository.remove(province);
  }

  async setHomepageFeatured(
    id: number,
    featured: boolean,
  ): Promise<Province> {
    const province = await this.provinceRepository.findOne({ where: { id } });
    if (!province) {
      throw new NotFoundException('ไม่พบจังหวัดที่ต้องการตั้งค่าหน้าแรก');
    }
    province.is_featured_homepage = !!featured;
    return this.provinceRepository.save(province);
  }

  /**
   * จังหวัดที่เลือกให้แสดงบนหน้าแรก พร้อมจำนวนกิจกรรมในแต่ละจังหวัด
   */
  async listFeaturedForHomepage(): Promise<
    {
      id: number;
      name: string;
      image_url: string | null;
      activity_count: number;
    }[]
  > {
    const provinces = await this.provinceRepository.find({
      where: { is_featured_homepage: true },
      order: { name: 'ASC' },
    });
    if (!provinces.length) return [];

    const ids = provinces.map((p) => p.id);
    const rawCounts = await this.activityRepository
      .createQueryBuilder('activity')
      .select('activity.province_id', 'province_id')
      .addSelect('COUNT(*)', 'cnt')
      .where('activity.province_id IN (:...ids)', { ids })
      .andWhere('activity.deleted_at IS NULL')
      .groupBy('activity.province_id')
      .getRawMany<{ province_id: number; cnt: string }>();

    const countMap = new Map<number, number>();
    for (const row of rawCounts) {
      countMap.set(Number(row.province_id), Number(row.cnt));
    }

    return provinces.map((p) => ({
      id: p.id,
      name: p.name,
      image_url: p.image_url,
      activity_count: countMap.get(p.id) ?? 0,
    }));
  }
}
