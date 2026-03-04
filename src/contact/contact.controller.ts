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

@Controller('contact')
@UseInterceptors(ResponseInterceptor)
@UseGuards(JwtAuthGuard)
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  async create(
    @Request() req: { user: User },
    @Body() dto: CreateContactMessageDto,
  ) {
    const created = await this.contactService.createFromUser(req.user, dto);
    return created;
  }
}

