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
import { ContactModule } from './contact/contact.module';
import { NewsModule } from './news/news.module';
import { PaymentConfigModule } from './payment-config/payment-config.module';
import { LegalModule } from './legal/legal.module';
import { EntryPopupModule } from './entry-popup/entry-popup.module';
import { AccessLogModule } from './access-log/access-log.module';
import { LoginLogModule } from './login-log/login-log.module';
import { UserActionLogModule } from './user-action-log/user-action-log.module';
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
    AccessLogModule,
    LoginLogModule,
    UserActionLogModule,
    OrderModule,
    SponsorModule,
    ContactModule,
    NewsModule,
    PaymentConfigModule,
    LegalModule,
    EntryPopupModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
