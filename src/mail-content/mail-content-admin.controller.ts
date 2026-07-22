import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { Audit } from '../common/decorators/audit.decorator';
import { User } from '../entities/user.entity';
import {
  MailContentStatus,
  MailContentToMode,
} from '../entities/mail-content.entity';
import { MailRecipientStatus } from '../entities/mail-content-recipient.entity';
import { CreateMailContentDto } from './dto/create-mail-content.dto';
import { UpdateMailContentDto } from './dto/update-mail-content.dto';
import { MailContentService } from './mail-content.service';

@Controller('admin/mail-contents')
@UseGuards(JwtAuthGuard, AdminGuard)
@UseInterceptors(ResponseInterceptor)
export class MailContentAdminController {
  constructor(private readonly mailContentService: MailContentService) {}

  @Get('recipients/preview')
  async previewRecipients(
    @Query('to_mode') toMode?: string,
    @Query('to_emails') toEmails?: string,
  ) {
    const mode =
      toMode === MailContentToMode.ALL_USERS
        ? MailContentToMode.ALL_USERS
        : MailContentToMode.MANUAL;
    return this.mailContentService.previewRecipients({
      to_mode: mode,
      to_emails: toEmails,
    });
  }

  @Get()
  async listAdmin(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
    const limitNum = limit
      ? Math.min(100, Math.max(1, parseInt(limit, 10) || 20))
      : 20;

    const statusFilter =
      status === MailContentStatus.DRAFT ||
      status === MailContentStatus.QUEUED ||
      status === MailContentStatus.SENDING ||
      status === MailContentStatus.SENT ||
      status === MailContentStatus.FAILED
        ? status
        : 'all';

    return this.mailContentService.listAdmin({
      page: pageNum,
      limit: limitNum,
      status: statusFilter,
      search: search?.trim() || undefined,
    });
  }

  @Get(':id/recipients')
  async listRecipients(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
    const limitNum = limit
      ? Math.min(100, Math.max(1, parseInt(limit, 10) || 20))
      : 20;
    const statusFilter =
      status === MailRecipientStatus.PENDING ||
      status === MailRecipientStatus.SENDING ||
      status === MailRecipientStatus.SENT ||
      status === MailRecipientStatus.FAILED
        ? status
        : 'all';

    return this.mailContentService.listRecipients(Number(id), {
      page: pageNum,
      limit: limitNum,
      status: statusFilter,
      search: search?.trim() || undefined,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.mailContentService.findOneById(Number(id));
  }

  @Post()
  @Audit({
    action: 'create',
    entity_type: 'mail_content',
    entityIdSource: 'result:id',
  })
  async create(
    @Body() dto: CreateMailContentDto,
    @Request() req: { user: User },
  ) {
    return this.mailContentService.create(dto, req.user?.id);
  }

  @Patch(':id')
  @Audit({
    action: 'edit',
    entity_type: 'mail_content',
    entityIdSource: 'param:id',
  })
  async update(@Param('id') id: string, @Body() dto: UpdateMailContentDto) {
    return this.mailContentService.update(Number(id), dto);
  }

  @Delete(':id')
  @Audit({
    action: 'delete',
    entity_type: 'mail_content',
    entityIdSource: 'param:id',
  })
  async remove(@Param('id') id: string) {
    await this.mailContentService.remove(Number(id));
    return { success: true, message: 'ลบเนื้อหาอีเมลเรียบร้อยแล้ว' };
  }

  @Post(':id/send')
  @Audit({
    action: 'edit',
    entity_type: 'mail_content',
    entityIdSource: 'param:id',
  })
  async send(@Param('id') id: string) {
    return this.mailContentService.enqueueSend(Number(id));
  }

  @Post(':id/retry-failed')
  @Audit({
    action: 'edit',
    entity_type: 'mail_content',
    entityIdSource: 'param:id',
  })
  async retryFailed(@Param('id') id: string) {
    return this.mailContentService.retryFailed(Number(id));
  }
}
