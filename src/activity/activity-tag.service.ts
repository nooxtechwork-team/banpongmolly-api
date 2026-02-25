import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import { Tag } from '../entities/tag.entity';
import { ActivityTag } from '../entities/activity-tag.entity';

export type ActivityTagDto = {
  id: number;
  name: string;
  slug: string;
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '');
}

@Injectable()
export class ActivityTagService {
  constructor(
    @InjectRepository(Tag)
    private readonly tagRepository: Repository<Tag>,
    @InjectRepository(ActivityTag)
    private readonly activityTagRepository: Repository<ActivityTag>,
  ) {}

  async getTagsForActivity(activityId: number): Promise<ActivityTagDto[]> {
    const links = await this.activityTagRepository.find({
      where: { activity_id: activityId, deleted_at: IsNull() },
      relations: ['tag'],
      order: { id: 'ASC' },
    });
    return links
      .map((link) => link.tag)
      .filter((tag): tag is Tag => !!tag && !tag.deleted_at && tag.is_active)
      .map((tag) => ({
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
      }));
  }

  async setTagsForActivity(
    activityId: number,
    rawNames: string[] | undefined,
  ): Promise<ActivityTagDto[]> {
    const names = Array.from(
      new Set(
        (rawNames || [])
          .map((n) => n?.trim())
          .filter((n): n is string => !!n),
      ),
    ).slice(0, 10);

    // ลบของเดิมทั้งหมด (soft delete)
    const existingLinks = await this.activityTagRepository.find({
      where: { activity_id: activityId, deleted_at: IsNull() },
    });
    if (existingLinks.length) {
      for (const link of existingLinks) {
        link.deleted_at = new Date();
        await this.activityTagRepository.save(link);
      }
    }

    if (!names.length) {
      return [];
    }

    const slugs = names.map((n) => slugify(n));

    const existingTags = await this.tagRepository.find({
      where: { slug: In(slugs), deleted_at: IsNull() },
    });
    const existingTagBySlug = new Map(existingTags.map((t) => [t.slug, t]));

    const toCreate: Tag[] = [];
    for (let i = 0; i < names.length; i += 1) {
      const name = names[i];
      const slug = slugs[i] || slugify(name);
      if (!existingTagBySlug.has(slug)) {
        const tag = this.tagRepository.create({
          name,
          slug,
          is_active: true,
        });
        toCreate.push(tag);
        existingTagBySlug.set(slug, tag);
      }
    }

    if (toCreate.length) {
      const saved = await this.tagRepository.save(toCreate);
      for (const tag of saved) {
        existingTagBySlug.set(tag.slug, tag);
      }
    }

    const allTags = slugs
      .map((slug) => existingTagBySlug.get(slug))
      .filter((t): t is Tag => !!t);

    const newLinks = allTags.map((tag) =>
      this.activityTagRepository.create({
        activity_id: activityId,
        tag_id: tag.id,
      }),
    );
    await this.activityTagRepository.save(newLinks);

    return allTags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
    }));
  }
}

