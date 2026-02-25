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
import { Order } from '../entities/order.entity';
import { AuditLog } from '../entities/audit-log.entity';

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
    Order,
    AuditLog,
  ],
  synchronize: process.env.NODE_ENV === 'development', // Set to false in production
  logging: process.env.NODE_ENV === 'development',
  // Connection pool settings
  extra: {
    connectionLimit: 10,
    connectTimeout: 60000, // 60 seconds
    acquireTimeout: 60000, // 60 seconds
    timeout: 60000, // 60 seconds
    // Enable keep-alive to prevent connection timeout
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  },
  // Retry connection on failure
  retryAttempts: 3,
  retryDelay: 3000, // 3 seconds
});
