import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organizer } from '../entities/organizer.entity';
import { OrganizerService } from './organizer.service';
import { OrganizerController } from './organizer.controller';
import { AdminGuard } from '../auth/guards/admin.guard';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [TypeOrmModule.forFeature([Organizer]), UploadModule],
  providers: [OrganizerService, AdminGuard],
  controllers: [OrganizerController],
})
export class OrganizerModule {}

