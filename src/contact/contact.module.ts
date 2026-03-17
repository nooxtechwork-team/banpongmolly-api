import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactMessage } from '../entities/contact-message.entity';
import { ContactService } from './contact.service';
import { ContactController } from './contact.controller';
import { ContactAdminController } from './contact-admin.controller';
import { UserActionLogModule } from '../user-action-log/user-action-log.module';

@Module({
  imports: [TypeOrmModule.forFeature([ContactMessage]), UserActionLogModule],
  controllers: [ContactController, ContactAdminController],
  providers: [ContactService],
})
export class ContactModule {}

