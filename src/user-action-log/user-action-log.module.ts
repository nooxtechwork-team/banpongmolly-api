import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserActionLog } from '../entities/user-action-log.entity';
import { UserActionLogService } from './user-action-log.service';
import { UserActionLogController } from './user-action-log.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserActionLog])],
  controllers: [UserActionLogController],
  providers: [UserActionLogService],
  exports: [UserActionLogService],
})
export class UserActionLogModule {}
