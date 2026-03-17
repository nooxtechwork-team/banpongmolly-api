import {
  Body,
  Controller,
  Post,
  UseGuards,
  Request,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ContactService } from './contact.service';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { User } from '../entities/user.entity';
import { UserActionLogService } from '../user-action-log/user-action-log.service';

@Controller('contact')
@UseInterceptors(ResponseInterceptor)
@UseGuards(JwtAuthGuard)
export class ContactController {
  constructor(
    private readonly contactService: ContactService,
    private readonly userActionLogService: UserActionLogService,
  ) {}

  @Post()
  async create(
    @Request() req: { user: User; ip?: string; headers?: Record<string, any> },
    @Body() dto: CreateContactMessageDto,
  ) {
    const created = await this.contactService.createFromUser(req.user, dto);
    const ip =
      (req as any).ip ||
      (req as any).headers?.['x-forwarded-for'] ||
      (req as any).headers?.['x-real-ip'] ||
      null;
    const userAgent = (req as any).headers?.['user-agent'] || null;

    await this.userActionLogService.create({
      user_id: req.user?.id ?? null,
      email: created.email ?? null,
      phone: created.phone ?? null,
      action: 'contact_submit',
      entity_type: 'contact',
      entity_id: created.id,
      ip,
      user_agent: userAgent,
      metadata: {
        subject: created.subject,
      },
    });
    return created;
  }
}
