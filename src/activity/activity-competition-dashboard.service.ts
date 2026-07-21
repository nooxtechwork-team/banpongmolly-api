import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { ActivityCompetitionDashboard } from '../entities/activity-competition-dashboard.entity';
import { ActivityCompetitionDashboardClassBlock } from '../entities/activity-competition-dashboard-class-block.entity';
import { ActivityCompetitionDashboardEntry } from '../entities/activity-competition-dashboard-entry.entity';
import {
  type CompetitionDashboardPayload,
  type CompetitionParticipantPayload,
} from '../common/utils/competition-dashboard.util';

function isDuplicateActivityDashboardError(err: unknown): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const driver = err.driverError as { code?: string; errno?: number } | undefined;
  return driver?.code === 'ER_DUP_ENTRY' || driver?.errno === 1062;
}

@Injectable()
export class ActivityCompetitionDashboardService {
  constructor(
    @InjectRepository(ActivityCompetitionDashboard)
    private readonly dashboardRepository: Repository<ActivityCompetitionDashboard>,
    @InjectRepository(ActivityCompetitionDashboardClassBlock)
    private readonly blockRepository: Repository<ActivityCompetitionDashboardClassBlock>,
    @InjectRepository(ActivityCompetitionDashboardEntry)
    private readonly entryRepository: Repository<ActivityCompetitionDashboardEntry>,
    private readonly dataSource: DataSource,
  ) {}

  /** อ่าน dashboard จากตาราง relational */
  async getPayload(activityId: number): Promise<CompetitionDashboardPayload | null> {
    const dashboard = await this.dashboardRepository.findOne({
      where: { activity_id: activityId },
    });
    if (!dashboard) return null;
    return this.buildPayload(dashboard);
  }

  /**
   * แทนที่ทั้ง dashboard ด้วย payload (null = ลบตาราง)
   */
  async replaceFromPayload(
    activityId: number,
    payload: CompetitionDashboardPayload | null,
  ): Promise<CompetitionDashboardPayload | null> {
    try {
      await this.dataSource.transaction(async (manager) => {
        const dashRepo = manager.getRepository(ActivityCompetitionDashboard);
        const blockRepo = manager.getRepository(
          ActivityCompetitionDashboardClassBlock,
        );
        const entryRepo = manager.getRepository(
          ActivityCompetitionDashboardEntry,
        );

        const existing = await dashRepo.findOne({
          where: { activity_id: activityId },
        });

        if (payload == null) {
          if (existing) {
            await entryRepo.delete({ dashboard_id: existing.id });
            await blockRepo.delete({ dashboard_id: existing.id });
            await dashRepo.delete({ id: existing.id });
          }
          return;
        }

        let dashboard = existing;
        if (!dashboard) {
          await dashRepo
            .createQueryBuilder()
            .insert()
            .into(ActivityCompetitionDashboard)
            .values({
              activity_id: activityId,
              enabled: !!payload.enabled,
              top_section_title: payload.top_section_title ?? null,
              champion_card_variant: payload.champion_card_variant ?? 'rotate',
              show_rank_gift_icons: payload.show_rank_gift_icons !== false,
            })
            .orIgnore()
            .execute();

          dashboard = await dashRepo.findOne({
            where: { activity_id: activityId },
          });
          if (!dashboard) {
            throw new Error(
              `Failed to create competition dashboard for activity ${activityId}`,
            );
          }
        }

        dashboard.enabled = !!payload.enabled;
        dashboard.top_section_title = payload.top_section_title ?? null;
        dashboard.champion_card_variant =
          payload.champion_card_variant ?? 'rotate';
        dashboard.show_rank_gift_icons = payload.show_rank_gift_icons !== false;
        dashboard = await dashRepo.save(dashboard);
        await entryRepo.delete({ dashboard_id: dashboard.id });
        await blockRepo.delete({ dashboard_id: dashboard.id });

        const champions = payload.champions ?? [];
        if (champions.length) {
          await entryRepo.save(
            champions.map((p, index) =>
              entryRepo.create({
                dashboard_id: dashboard!.id,
                kind: 'champion',
                class_block_id: null,
                sort_order: index,
                ...this.participantToColumns(p),
              }),
            ),
          );
        }

        const blocks = payload.class_blocks ?? [];
        for (let bi = 0; bi < blocks.length; bi++) {
          const block = blocks[bi];
          const savedBlock = await blockRepo.save(
            blockRepo.create({
              dashboard_id: dashboard!.id,
              sort_order: bi,
              class_slug: block.class_slug ?? null,
              class_label: block.class_label ?? null,
            }),
          );
          const ranks = block.ranks ?? [];
          if (ranks.length) {
            await entryRepo.save(
              ranks.map((p, index) =>
                entryRepo.create({
                  dashboard_id: dashboard!.id,
                  kind: 'rank',
                  class_block_id: savedBlock.id,
                  sort_order: index,
                  ...this.participantToColumns(p),
                }),
              ),
            );
          }
        }
      });
    } catch (err) {
      if (!isDuplicateActivityDashboardError(err)) throw err;
      // concurrent create — payload ถูกเขียนโดย request อื่นแล้ว
    }

    return payload;
  }

  private async buildPayload(
    dashboard: ActivityCompetitionDashboard,
  ): Promise<CompetitionDashboardPayload> {
    const [blocks, entries] = await Promise.all([
      this.blockRepository.find({
        where: { dashboard_id: dashboard.id },
        order: { sort_order: 'ASC', id: 'ASC' },
      }),
      this.entryRepository.find({
        where: { dashboard_id: dashboard.id },
        order: { sort_order: 'ASC', id: 'ASC' },
      }),
    ]);

    const champions = entries
      .filter((e) => e.kind === 'champion')
      .map((e) => this.entryToParticipant(e));

    const class_blocks = blocks.map((block) => ({
      class_slug: block.class_slug ?? undefined,
      class_label: block.class_label ?? undefined,
      ranks: entries
        .filter((e) => e.kind === 'rank' && e.class_block_id === block.id)
        .map((e) => this.entryToParticipant(e)),
    }));

    return {
      enabled: !!dashboard.enabled,
      top_section_title: dashboard.top_section_title ?? undefined,
      champion_card_variant: (dashboard.champion_card_variant ??
        'rotate') as CompetitionDashboardPayload['champion_card_variant'],
      show_rank_gift_icons: dashboard.show_rank_gift_icons !== false,
      champions,
      class_blocks,
    };
  }

  private participantToColumns(p: CompetitionParticipantPayload) {
    return {
      image_url: p.image_url ?? null,
      reward_image_url: p.reward_image_url ?? null,
      class_reward_image_url: p.class_reward_image_url ?? null,
      division_reward_image_url: p.division_reward_image_url ?? null,
      fish_owner: p.fish_owner ?? null,
      farm_name: p.farm_name ?? null,
      display_name: p.display_name ?? null,
      class_code: p.class_code ?? null,
      participant_type: p.participant_type ?? null,
      sex: p.sex ?? null,
      rank: p.rank ?? null,
      reward: p.reward ?? null,
      category_line: p.category_line ?? null,
      qualifier_label: p.qualifier_label ?? null,
      score: p.score != null && p.score !== '' ? String(p.score) : null,
      promotion_cta: p.promotion_cta ?? null,
      champion_card_style: p.champion_card_style ?? null,
    };
  }

  private entryToParticipant(
    e: ActivityCompetitionDashboardEntry,
  ): CompetitionParticipantPayload {
    return {
      image_url: e.image_url,
      reward_image_url: e.reward_image_url,
      class_reward_image_url: e.class_reward_image_url,
      division_reward_image_url: e.division_reward_image_url,
      fish_owner: e.fish_owner ?? undefined,
      farm_name: e.farm_name ?? undefined,
      display_name: e.display_name ?? undefined,
      class_code: e.class_code ?? undefined,
      participant_type: e.participant_type ?? undefined,
      sex: e.sex ?? undefined,
      rank: e.rank ?? undefined,
      reward: e.reward ?? undefined,
      category_line: e.category_line ?? undefined,
      qualifier_label: e.qualifier_label ?? undefined,
      score: e.score ?? undefined,
      promotion_cta: e.promotion_cta ?? undefined,
      champion_card_style: e.champion_card_style as
        | CompetitionParticipantPayload['champion_card_style']
        | undefined,
    };
  }
}
