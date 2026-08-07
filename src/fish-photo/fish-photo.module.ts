import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FishPhoto } from '../entities/fish-photo.entity';
import { ActivityRegistrationEntry } from '../entities/activity-registration-entry.entity';
import { ActivityRegistration } from '../entities/activity-registration.entity';
import { Activity } from '../entities/activity.entity';
import { Order } from '../entities/order.entity';
import { AdminGuard } from '../auth/guards/admin.guard';
import { UploadModule } from '../upload/upload.module';
import { FishPhotoService } from './fish-photo.service';
import { FishPhotoAdminController } from './fish-photo-admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FishPhoto,
      ActivityRegistrationEntry,
      ActivityRegistration,
      Activity,
      Order,
    ]),
    UploadModule,
  ],
  providers: [FishPhotoService, AdminGuard],
  controllers: [FishPhotoAdminController],
  exports: [FishPhotoService],
})
export class FishPhotoModule {}
