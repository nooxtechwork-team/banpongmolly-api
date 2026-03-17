import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ContactService } from './contact.service';
import { ContactMessage } from '../entities/contact-message.entity';

@Controller('admin/contact-messages')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ContactAdminController {
  constructor(private readonly contactService: ContactService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{ items: ContactMessage[]; total: number }> {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
    const limitNum = limit
      ? Math.min(100, Math.max(1, parseInt(limit, 10) || 10))
      : 10;
    return this.contactService.findPaginated(pageNum, limitNum);
  }
}
