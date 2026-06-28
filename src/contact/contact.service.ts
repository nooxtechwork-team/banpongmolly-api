import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactMessage } from '../entities/contact-message.entity';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';
import { User } from '../entities/user.entity';

export type ContactMessageListItem = {
  id: number;
  user_id: number | null;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  created_at: Date;
  avatar_url: string | null;
};

@Injectable()
export class ContactService {
  constructor(
    @InjectRepository(ContactMessage)
    private readonly contactRepo: Repository<ContactMessage>,
  ) {}

  async createFromUser(
    user: User,
    dto: CreateContactMessageDto,
  ): Promise<ContactMessage> {
    const entity = this.contactRepo.create({
      user_id: user.id,
      name: (dto.name || user.fullname).trim(),
      email: (dto.email || user.email).trim(),
      phone: (dto.phone ?? user.phone_number) || null,
      subject: (dto.subject || '').trim() || 'ข้อความจากแบบฟอร์มติดต่อ',
      message: dto.message.trim(),
    });
    return this.contactRepo.save(entity);
  }

  async findPaginated(
    page: number = 1,
    limit: number = 10,
    search?: string,
  ): Promise<{ items: ContactMessageListItem[]; total: number }> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const q = (search || '').trim();

    const qb = this.contactRepo
      .createQueryBuilder('msg')
      .leftJoinAndSelect('msg.user', 'user')
      .orderBy('msg.created_at', 'DESC');

    if (q) {
      const like = `%${q}%`;
      qb.andWhere(
        '(msg.name LIKE :like OR msg.email LIKE :like OR msg.phone LIKE :like OR msg.subject LIKE :like OR msg.message LIKE :like)',
        { like },
      );
    }

    const [rows, total] = await qb
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit)
      .getManyAndCount();

    const items = rows.map((msg) => ({
      id: msg.id,
      user_id: msg.user_id,
      name: msg.name,
      email: msg.email,
      phone: msg.phone,
      subject: msg.subject,
      message: msg.message,
      created_at: msg.created_at,
      avatar_url:
        msg.user?.avatar_url != null && String(msg.user.avatar_url).trim() !== ''
          ? String(msg.user.avatar_url).trim()
          : null,
    }));

    return { items, total };
  }
}

