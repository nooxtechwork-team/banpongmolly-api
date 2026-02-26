import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { ProvinceModule } from './province/province.module';
import { ActivityModule } from './activity/activity.module';
import { ActivityPackageModule } from './activity-package/activity-package.module';
import { OrganizerModule } from './organizer/organizer.module';
import { UploadModule } from './upload/upload.module';
import { UserModule } from './user/user.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { OrderModule } from './order/order.module';
import { SponsorModule } from './sponsor/sponsor.module';
import { getDatabaseConfig } from './config/database.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: getDatabaseConfig,
      inject: [ConfigService],
    }),
    MailModule,
    AuthModule,
    ProvinceModule,
    ActivityModule,
    ActivityPackageModule,
    OrganizerModule,
    UploadModule,
    UserModule,
    AuditLogModule,
    OrderModule,
    SponsorModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
