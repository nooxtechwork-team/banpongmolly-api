import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactMessage } from '../entities/contact-message.entity';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';
import { User } from '../entities/user.entity';

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
  ): Promise<{ items: ContactMessage[]; total: number }> {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const [items, total] = await this.contactRepo.findAndCount({
      order: { created_at: 'DESC' },
      skip: (page - 1) * safeLimit,
      take: safeLimit,
    });
    return { items, total };
  }
}

