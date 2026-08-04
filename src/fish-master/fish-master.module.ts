import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FishGeneration } from '../entities/fish-generation.entity';
import { FishGender } from '../entities/fish-gender.entity';
import { AdminGuard } from '../auth/guards/admin.guard';
import { UserActionLogModule } from '../user-action-log/user-action-log.module';
import { FishGenerationService } from './fish-generation.service';
import { FishGenderService } from './fish-gender.service';
import { FishGenerationAdminController } from './fish-generation-admin.controller';
import { FishGenderAdminController } from './fish-gender-admin.controller';
import { FishGenerationPublicController } from './fish-generation-public.controller';
import { FishGenderPublicController } from './fish-gender-public.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([FishGeneration, FishGender]),
    UserActionLogModule,
  ],
  providers: [FishGenerationService, FishGenderService, AdminGuard],
  controllers: [
    FishGenerationAdminController,
    FishGenderAdminController,
    FishGenerationPublicController,
    FishGenderPublicController,
  ],
  exports: [FishGenerationService, FishGenderService],
})
export class FishMasterModule {}
