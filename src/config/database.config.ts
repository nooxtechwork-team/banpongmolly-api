import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../entities/user.entity';
import { UserAuth } from '../entities/user-auth.entity';
import { Province } from '../entities/province.entity';
import { Activity } from '../entities/activity.entity';
import { Organizer } from '../entities/organizer.entity';
import { ActivityPackage } from '../entities/activity-package.entity';
import { ActivityPackagePrice } from '../entities/activity-package-price.entity';
import { ActivityReward } from '../entities/activity-reward.entity';
import { Tag } from '../entities/tag.entity';
import { ActivityTag } from '../entities/activity-tag.entity';
import { ActivityRegistration } from '../entities/activity-registration.entity';
import { ActivitySponsorPackage } from '../entities/activity-sponsor-package.entity';
import { SponsorRegistration } from '../entities/sponsor.entity';
import { SponsorPackage } from '../entities/sponsor-package.entity';
import { Order } from '../entities/order.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { AccessLog } from '../entities/access-log.entity';
import { LoginLog } from '../entities/login-log.entity';
import { UserActionLog } from '../entities/user-action-log.entity';
import { ContactMessage } from '../entities/contact-message.entity';
import { News } from '../entities/news.entity';

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'mysql',
  host: configService.get<string>('DATABASE_HOST'),
  port: configService.get<number>('DATABASE_PORT'),
  username: configService.get<string>('DATABASE_USERNAME'),
  password: configService.get<string>('DATABASE_PASSWORD'),
  database: configService.get<string>('DATABASE_NAME'),
  entities: [
    User,
    UserAuth,
    Province,
    Activity,
    Organizer,
    ActivityPackage,
    ActivityPackagePrice,
    ActivityReward,
    Tag,
    ActivityTag,
    ActivityRegistration,
    ActivitySponsorPackage,
    SponsorRegistration,
    SponsorPackage,
    Order,
    AuditLog,
    AccessLog,
    LoginLog,
    UserActionLog,
    ContactMessage,
    News,
  ],
  synchronize: process.env.NODE_ENV === 'development', // Set to false in production
  logging: process.env.NODE_ENV === 'development',
});
