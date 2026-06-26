/**
 * Seed กิจกรรมและข่าวสารจำนวนมากสำหรับ dev/demo
 *
 * รัน:
 *   pnpm --dir api run script:seed-activities-news
 *   pnpm --dir api run script:seed-activities-news -- --force   # ลบ seed เดิมแล้วใส่ใหม่
 *
 * เงื่อนไข:
 * - ต้องมี MySQL + .env ของ api พร้อมใช้งาน
 * - ตาราง provinces ต้องมีข้อมูล (boot API ครั้งแรกจะ seed จังหวัดให้)
 * - ใช้รูปจาก api/public/uploads/activities/ (ถ้าไม่มีจะ fallback เป็น path ตัวอย่าง)
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { Like, Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ActivityTagService } from '../src/activity/activity-tag.service';
import { Activity, ActivityStatus } from '../src/entities/activity.entity';
import { News, NewsCategory } from '../src/entities/news.entity';
import { Province } from '../src/entities/province.entity';
import {
  ACTIVITY_SEED_COUNT,
  ACTIVITY_TAG_POOL,
  NEWS_SEED_COUNT,
  SEED_SLUG_PREFIX,
  STATUS_ROTATION,
  VENUE_POOL,
  addDays,
  buildActivityDescription,
  buildActivityTitle,
  buildNewsContent,
  buildNewsTitle,
  pad2,
  pick,
  toDateString,
} from './seed-activities-news.data';

const logger = new Logger('seed-activities-news');

function listActivityImages(): string[] {
  const dir = join(process.cwd(), 'public', 'uploads', 'activities');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /\.(png|jpe?g|webp)$/i.test(name))
    .sort()
    .map((name) => `/uploads/activities/${name}`);
}

function imageAt(images: string[], index: number): string {
  if (!images.length) {
    return '/uploads/activities/1775237826051-3prsbyd1.png';
  }
  return images[index % images.length]!;
}

function pickTags(index: number): string[] {
  const count = 2 + (index % 3);
  const tags: string[] = [];
  for (let i = 0; i < count; i += 1) {
    tags.push(pick(ACTIVITY_TAG_POOL, index + i * 2));
  }
  return Array.from(new Set(tags));
}

async function clearSeedData(
  activityRepo: Repository<Activity>,
  newsRepo: Repository<News>,
  tagService: ActivityTagService,
): Promise<void> {
  const seedActivities = await activityRepo.find({
    where: { slug: Like(`${SEED_SLUG_PREFIX}%`) },
    select: ['id'],
  });
  for (const activity of seedActivities) {
    await tagService.setTagsForActivity(activity.id, []);
  }
  await activityRepo
    .createQueryBuilder()
    .delete()
    .where('slug LIKE :prefix', { prefix: `${SEED_SLUG_PREFIX}%` })
    .execute();
  await newsRepo
    .createQueryBuilder()
    .delete()
    .where('slug LIKE :prefix', { prefix: `${SEED_SLUG_PREFIX}%` })
    .execute();
}

async function seedActivities(
  activityRepo: Repository<Activity>,
  provinceRepo: Repository<Province>,
  tagService: ActivityTagService,
  images: string[],
): Promise<Activity[]> {
  const provinces = await provinceRepo.find({ order: { id: 'ASC' } });
  if (!provinces.length) {
    throw new Error('ไม่พบข้อมูลจังหวัด — รัน API ครั้งหนึ่งเพื่อ seed provinces ก่อน');
  }

  const now = new Date();
  const year = now.getFullYear();
  const saved: Activity[] = [];

  for (let i = 0; i < ACTIVITY_SEED_COUNT; i += 1) {
    const province = pick(provinces, i + 5);
    const title = buildActivityTitle(i, province.name, year);
    const slug = `${SEED_SLUG_PREFIX}activity-${pad2(i + 1)}`;
    const status = pick(STATUS_ROTATION, i);
    const dayOffset = -120 + i * 9;
    const startDate = addDays(now, dayOffset);
    const endDate = addDays(startDate, i % 3 === 0 ? 2 : 1);
    const cover = imageAt(images, i);
    const banner = imageAt(images, i + 7);
    const venue = pick(VENUE_POOL, i);
    const locationName = `${venue} ${province.name}`;
    const isFeatured = status === ActivityStatus.OPEN && i % 6 === 0;

    let registrationOpenAt: Date | null = null;
    let registrationDeadline: Date | null = null;
    if (status === ActivityStatus.OPEN || status === ActivityStatus.CLOSED) {
      registrationOpenAt = addDays(startDate, -45);
      registrationDeadline = addDays(startDate, -2);
    }

    const entity = activityRepo.create({
      organizer_id: null,
      title,
      slug,
      cover_image: cover,
      banner_image: banner,
      description: buildActivityDescription(title, province.name),
      live_embeds_json:
        i % 5 === 0
          ? JSON.stringify([
              {
                title: 'ถ่ายทอดสด',
                platform: 'youtube',
                embed_url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
              },
            ])
          : null,
      competition_dashboard_json: null,
      detail_infographic_url: i % 8 === 0 ? cover : null,
      province_id: province.id,
      start_date: startDate,
      end_date: endDate,
      start_time: i % 2 === 0 ? '08:00:00' : '09:30:00',
      end_time: i % 2 === 0 ? '17:00:00' : '18:30:00',
      registration_open_at: registrationOpenAt,
      registration_deadline: registrationDeadline,
      location_name: locationName,
      location_address: `เลขที่ ${100 + i} ถนนตัวอย่าง ตำบลตัวอย่าง อำเภอตัวอย่าง จังหวัด${province.name} ${10000 + i}`,
      location_google_maps_url: `https://maps.google.com/?q=${encodeURIComponent(locationName)}`,
      location_latitude: 13.7 + (i % 10) * 0.05,
      location_longitude: 100.4 + (i % 10) * 0.04,
      contact_info: 'LINE: @banpongmolly | โทร 02-000-0000',
      activity_package_id: null,
      max_participants: 80 + (i % 12) * 20,
      status,
      is_featured_homepage: isFeatured,
    });

    const row = await activityRepo.save(entity);
    await tagService.setTagsForActivity(row.id, pickTags(i));
    saved.push(row);
  }

  return saved;
}

async function seedNews(
  newsRepo: Repository<News>,
  activities: Activity[],
  images: string[],
): Promise<number> {
  const categories: NewsCategory[] = [
    NewsCategory.NEWS,
    NewsCategory.ANNOUNCEMENT,
    NewsCategory.EVENT,
  ];
  const now = new Date();
  let created = 0;

  for (let i = 0; i < NEWS_SEED_COUNT; i += 1) {
    const category = pick(categories, i);
    const activity = pick(activities, i);
    const publishedAt = addDays(now, -90 + i * 2);
    const dateLabel = toDateString(publishedAt);
    const title = buildNewsTitle(i, category, activity.title, dateLabel);
    const slug = `${SEED_SLUG_PREFIX}news-${pad2(i + 1)}`;
    const excerpt = `อัปเดตล่าสุดเกี่ยวกับ ${activity.title} และชุมชน Banpong Molly — ${dateLabel}`;

    const entity = newsRepo.create({
      slug,
      title,
      excerpt,
      content: buildNewsContent(title, excerpt),
      category,
      thumbnail_url: imageAt(images, i + 3),
      published_at: publishedAt,
      is_published: i % 11 !== 0,
    });

    await newsRepo.save(entity);
    created += 1;
  }

  return created;
}

async function main() {
  const force = process.argv.includes('--force');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const activityRepo = app.get<Repository<Activity>>(getRepositoryToken(Activity));
    const newsRepo = app.get<Repository<News>>(getRepositoryToken(News));
    const provinceRepo = app.get<Repository<Province>>(getRepositoryToken(Province));
    const tagService = app.get(ActivityTagService);

    const existingActivities = await activityRepo.count({
      where: { slug: Like(`${SEED_SLUG_PREFIX}%`) },
    });

    if (existingActivities > 0 && !force) {
      logger.warn(
        `พบ seed เดิม ${existingActivities} กิจกรรม — ข้าม (ใช้ --force เพื่อลบแล้ว seed ใหม่)`,
      );
      return;
    }

    if (force) {
      logger.log('ลบ seed เดิม...');
      await clearSeedData(activityRepo, newsRepo, tagService);
    }

    const images = listActivityImages();
    logger.log(`พบรูปกิจกรรม ${images.length} ไฟล์ใน public/uploads/activities`);

    logger.log(`กำลัง seed กิจกรรม ${ACTIVITY_SEED_COUNT} รายการ...`);
    const activities = await seedActivities(activityRepo, provinceRepo, tagService, images);

    logger.log(`กำลัง seed ข่าว ${NEWS_SEED_COUNT} รายการ...`);
    const newsCount = await seedNews(newsRepo, activities, images);

    logger.log(
      `เสร็จสิ้น — กิจกรรม ${activities.length} | ข่าว ${newsCount} | slug prefix: ${SEED_SLUG_PREFIX}`,
    );
    logger.log(`ตัวอย่าง: /activities/${activities[0]?.slug} | /news/${SEED_SLUG_PREFIX}news-01`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
