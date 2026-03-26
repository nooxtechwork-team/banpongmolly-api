import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntryPopupConfig } from '../entities/entry-popup-config.entity';
import { EntryPopupService } from './entry-popup.service';
import { EntryPopupPublicController } from './entry-popup-public.controller';
import { EntryPopupAdminController } from './entry-popup-admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([EntryPopupConfig])],
  providers: [EntryPopupService],
  controllers: [EntryPopupPublicController, EntryPopupAdminController],
  exports: [EntryPopupService],
})
export class EntryPopupModule {}
