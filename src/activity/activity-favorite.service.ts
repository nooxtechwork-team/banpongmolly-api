import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ActivityFavorite } from '../entities/activity-favorite.entity';
import { Activity, ActivityStatus } from '../entities/activity.entity';
import { ActivityService } from './activity.service';

@Injectable()
export class ActivityFavoriteService {
  constructor(
    @InjectRepository(ActivityFavorite)
    private readonly favoriteRepository: Repository<ActivityFavorite>,
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    private readonly activityService: ActivityService,
  ) {}

  async listActivityIdsForUser(userId: number): Promise<number[]> {
    const rows = await this.favoriteRepository.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      select: ['activity_id'],
    });
    return rows.map((row) => row.activity_id);
  }

  async findPublicPaginatedForUser(
    userId: number,
    page: number = 1,
    limit: number = 10,
    options?: {
      search?: string;
      status?: 'open' | 'upcoming' | 'finished';
      sort?: 'upcoming' | 'latest' | 'oldest';
      province_id?: number;
    },
  ) {
    return this.activityService.findPublicPaginated(page, limit, {
      ...options,
      favorite_user_id: userId,
    });
  }

  private async assertPublicActivity(activityId: number): Promise<Activity> {
    const activity = await this.activityRepository.findOne({
      where: { id: activityId, deleted_at: IsNull() },
    });
    if (!activity || activity.status === ActivityStatus.DRAFT) {
      throw new NotFoundException('ไม่พบกิจกรรม');
    }
    return activity;
  }

  async add(userId: number, activityId: number): Promise<{ favorited: true }> {
    await this.assertPublicActivity(activityId);

    const existing = await this.favoriteRepository.findOne({
      where: { user_id: userId, activity_id: activityId },
    });
    if (existing) {
      return { favorited: true };
    }

    try {
      await this.favoriteRepository.save({
        user_id: userId,
        activity_id: activityId,
      });
    } catch {
      throw new ConflictException('บันทึกรายการโปรดไม่สำเร็จ');
    }

    return { favorited: true };
  }

  async remove(
    userId: number,
    activityId: number,
  ): Promise<{ favorited: false }> {
    await this.favoriteRepository.delete({
      user_id: userId,
      activity_id: activityId,
    });
    return { favorited: false };
  }
}
