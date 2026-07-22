import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

/**
 * Shared BullMQ / Redis connection สำหรับทุกคิวในระบบ
 * (mail, checkout โรงพยาบาล-style, ฯลฯ ในอนาคต)
 *
 * Key ใน Redis: `{REDIS_PREFIX}:{queueName}:...`
 * เช่น banpong-molly:mail-content-send:waiting
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const prefix =
          config.get<string>('REDIS_PREFIX')?.trim() || 'banpong-molly';
        return {
          prefix,
          connection: {
            host: config.get<string>('REDIS_HOST') || '127.0.0.1',
            port: Number(config.get<string>('REDIS_PORT')) || 6379,
            password: config.get<string>('REDIS_PASSWORD') || undefined,
            db: Number(config.get<string>('REDIS_DB')) || 0,
          },
        };
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
