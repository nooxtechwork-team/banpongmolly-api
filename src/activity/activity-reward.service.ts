import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ActivityReward } from '../entities/activity-reward.entity';
import { ActivityRewardItemDto } from './dto/upsert-activity-rewards.dto';

export type ActivityRewardDto = {
  id: number;
  activity_id: number;
  rank_order: number;
  title: string;
  prize_description: string;
  status: string;
};

@Injectable()
export class ActivityRewardService {
  constructor(
    @InjectRepository(ActivityReward)
    private readonly rewardRepository: Repository<ActivityReward>,
  ) {}

  async findByActivityId(activityId: number): Promise<ActivityRewardDto[]> {
    const rows = await this.rewardRepository.find({
      where: { activity_id: activityId, deleted_at: IsNull() },
      order: { rank_order: 'ASC' },
    });
    return rows.map((r) => ({
      id: r.id,
      activity_id: r.activity_id,
      rank_order: r.rank_order,
      title: r.title,
      prize_description: r.prize_description,
      status: r.status,
    }));
  }

  async setRewards(
    activityId: number,
    items: ActivityRewardItemDto[],
  ): Promise<ActivityRewardDto[]> {
    const existing = await this.rewardRepository.find({
      where: { activity_id: activityId, deleted_at: IsNull() },
    });
    for (const row of existing) {
      row.deleted_at = new Date();
      await this.rewardRepository.save(row);
    }
    const toInsert = items
      .filter((i) => i.rank_order >= 1 && i.rank_order <= 3)
      .sort((a, b) => a.rank_order - b.rank_order)
      .slice(0, 3)
      .map((i) =>
        this.rewardRepository.create({
          activity_id: activityId,
          rank_order: i.rank_order,
          title: i.title.trim(),
          prize_description: i.prize_description.trim(),
          status: i.status || 'pending',
        }),
      );
    const saved = await this.rewardRepository.save(toInsert);
    return saved.map((r) => ({
      id: r.id,
      activity_id: r.activity_id,
      rank_order: r.rank_order,
      title: r.title,
      prize_description: r.prize_description,
      status: r.status,
    }));
  }
}
