import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findPaginated(
    page: number = 1,
    limit: number = 10,
    filters?: {
      search?: string;
      email?: string;
      phone?: string;
      province_id?: number;
    },
  ): Promise<{ items: User[]; total: number }> {
    const qb = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.province', 'province')
      .where('user.deleted_at IS NULL');

    if (filters?.search?.trim()) {
      const term = `%${filters.search.trim()}%`;
      qb.andWhere('(user.fullname LIKE :term OR user.email LIKE :term)', {
        term,
      });
    }
    if (filters?.email?.trim()) {
      qb.andWhere('user.email LIKE :email', {
        email: `%${filters.email.trim()}%`,
      });
    }
    if (filters?.phone?.trim()) {
      qb.andWhere('user.phone_number LIKE :phone', {
        phone: `%${filters.phone.trim()}%`,
      });
    }
    if (filters?.province_id != null) {
      qb.andWhere('user.province_id = :province_id', {
        province_id: filters.province_id,
      });
    }

    qb.orderBy('user.created_at', 'DESC');

    const [items, total] = await qb
      .skip((page - 1) * limit)
      .take(Math.min(Math.max(1, limit), 100))
      .getManyAndCount();

    return { items, total };
  }

  async findOne(id: number): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id, deleted_at: IsNull() },
      relations: ['province'],
    });
    if (!user) {
      throw new NotFoundException('ไม่พบผู้ใช้งาน');
    }
    return user;
  }

  async update(
    id: number,
    dto: Partial<{
      fullname: string;
      phone_number: string | null;
      province_id: number | null;
      about_you: string | null;
      role: import('../entities/user.entity').UserRole;
      is_verified: boolean;
    }>,
  ): Promise<User> {
    const existing = await this.findOne(id);
    if (dto.fullname !== undefined) existing.fullname = dto.fullname;
    if (dto.phone_number !== undefined)
      existing.phone_number = dto.phone_number;
    if (dto.province_id !== undefined) existing.province_id = dto.province_id;
    if (dto.about_you !== undefined) existing.about_you = dto.about_you;
    if (dto.role !== undefined) existing.role = dto.role;
    if (dto.is_verified !== undefined)
      existing.is_verified = Boolean(dto.is_verified);
    return this.userRepository.save(existing);
  }

  async softDelete(id: number): Promise<void> {
    const existing = await this.findOne(id);
    (existing as any).deleted_at = new Date();
    await this.userRepository.save(existing);
  }
}
