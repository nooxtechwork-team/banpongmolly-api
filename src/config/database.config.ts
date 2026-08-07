import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../entities/user.entity';
import { UserAuth } from '../entities/user-auth.entity';
import { Province } from '../entities/province.entity';
import { Activity } from '../entities/activity.entity';
import { Organizer } from '../entities/organizer.entity';
import { ActivityPackage } from '../entities/activity-package.entity';
import { ActivityPackagePrice } from '../entities/activity-package-price.entity';
import { Tag } from '../entities/tag.entity';
import { ActivityTag } from '../entities/activity-tag.entity';
import { ActivityRegistration } from '../entities/activity-registration.entity';
import { ActivityClassChangeRequest } from '../entities/activity-class-change-request.entity';
import { ActivityClassChangeLog } from '../entities/activity-class-change-log.entity';
import { ActivityRegistrationEntry } from '../entities/activity-registration-entry.entity';
import { ActivityCompetitionDashboard } from '../entities/activity-competition-dashboard.entity';
import { ActivityCompetitionDashboardClassBlock } from '../entities/activity-competition-dashboard-class-block.entity';
import { ActivityCompetitionDashboardEntry } from '../entities/activity-competition-dashboard-entry.entity';
import { ActivityFavorite } from '../entities/activity-favorite.entity';
import { ActivitySponsorPackage } from '../entities/activity-sponsor-package.entity';
import { SponsorRegistration } from '../entities/sponsor.entity';
import { SponsorPackage } from '../entities/sponsor-package.entity';
import { Order } from '../entities/order.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { AccessLog } from '../entities/access-log.entity';
import { LoginLog } from '../entities/login-log.entity';
import { UserActionLog } from '../entities/user-action-log.entity';
import { ContactMessage } from '../entities/contact-message.entity';
import { PaymentConfig } from '../entities/payment-config.entity';
import { News } from '../entities/news.entity';
import { MailContent } from '../entities/mail-content.entity';
import { MailContentRecipient } from '../entities/mail-content-recipient.entity';
import { LegalPolicy } from '../entities/legal-policy.entity';
import { PolicyAcceptance } from '../entities/policy-acceptance.entity';
import { EntryPopupConfig } from '../entities/entry-popup-config.entity';
import { HeroBannerSlide } from '../entities/hero-banner-slide.entity';
import { SponsorTierLookup } from '../entities/sponsor-tier.entity';
import { FishGeneration } from '../entities/fish-generation.entity';
import { FishGender } from '../entities/fish-gender.entity';
import { PrintJob } from '../entities/print-job.entity';
import { CheckoutDevice } from '../entities/checkout-device.entity';
import { CheckoutTicket } from '../entities/checkout-ticket.entity';
import { CheckoutTicketItem } from '../entities/checkout-ticket-item.entity';
import { CheckoutTicketEvent } from '../entities/checkout-ticket-event.entity';
import { CheckoutQueueSettings } from '../entities/checkout-queue-settings.entity';
import { FishPhoto } from '../entities/fish-photo.entity';
import { PosApkRelease } from '../entities/pos-apk-release.entity';
import { PosApkSettings } from '../entities/pos-apk-settings.entity';

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'mysql',
  host: configService.get<string>('DATABASE_HOST'),
  port: configService.get<number>('DATABASE_PORT'),
  username: configService.get<string>('DATABASE_USERNAME'),
  password: configService.get<string>('DATABASE_PASSWORD'),
  database: configService.get<string>('DATABASE_NAME'),
  // Heartbeat reclaim must not depend on MySQL session TZ vs Node Date.
  // Store/compare epoch ms for reclaim; force UTC for remaining datetime fields.
  timezone: 'Z',
  dateStrings: false,
  entities: [
    User,
    UserAuth,
    Province,
    Activity,
    Organizer,
    ActivityPackage,
    ActivityPackagePrice,
    Tag,
    ActivityTag,
    ActivityRegistration,
    ActivityClassChangeRequest,
    ActivityClassChangeLog,
    ActivityRegistrationEntry,
    ActivityCompetitionDashboard,
    ActivityCompetitionDashboardClassBlock,
    ActivityCompetitionDashboardEntry,
    ActivityFavorite,
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
    MailContent,
    MailContentRecipient,
    PaymentConfig,
    LegalPolicy,
    PolicyAcceptance,
    EntryPopupConfig,
    HeroBannerSlide,
    SponsorTierLookup,
    FishGeneration,
    FishGender,
    PrintJob,
    CheckoutDevice,
    CheckoutTicket,
    CheckoutTicketItem,
    CheckoutTicketEvent,
    CheckoutQueueSettings,
    FishPhoto,
    PosApkRelease,
    PosApkSettings,
  ],
  synchronize: process.env.NODE_ENV === 'development', // Set to false in production
  logging: process.env.NODE_ENV === 'development',
});
