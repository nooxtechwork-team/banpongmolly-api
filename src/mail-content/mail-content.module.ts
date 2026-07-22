import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailContent } from '../entities/mail-content.entity';
import { MailContentRecipient } from '../entities/mail-content-recipient.entity';
import { User } from '../entities/user.entity';
import { QUEUE_NAMES } from '../queue/queue.constants';
import { MailContentAdminController } from './mail-content-admin.controller';
import { MailContentService } from './mail-content.service';
import { MailContentSendProcessor } from './mail-content-send.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([MailContent, MailContentRecipient, User]),
    BullModule.registerQueue({
      name: QUEUE_NAMES.MAIL_CONTENT_SEND,
    }),
  ],
  controllers: [MailContentAdminController],
  providers: [MailContentService, MailContentSendProcessor],
})
export class MailContentModule {}
