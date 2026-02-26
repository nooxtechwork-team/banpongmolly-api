import { Body, Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ActivityService } from '../activity/activity.service';
import { SponsorService } from './sponsor.service';
import { CreateSponsorRegistrationDto } from './dto/create-sponsor-registration.dto';
import { SponsorPackageService } from './sponsor-package.service';

@Controller('sponsors')
export class PublicSponsorController {
  constructor(
    private readonly activityService: ActivityService,
    private readonly sponsorService: SponsorService,
    private readonly sponsorPackageService: SponsorPackageService,
  ) {}

  @Post('activity/:activityId/register')
  async registerForActivity(
    @Param('activityId', ParseIntPipe) activityId: number,
    @Body() dto: CreateSponsorRegistrationDto,
  ) {
    // ยืนยันว่า activity มีจริง
    const activity = await this.activityService.findOne(activityId);

    // ดึง package จาก id และยืนยันว่า active
    const pkg = await this.sponsorPackageService.findOne(dto.sponsor_package_id);
    if (!pkg.is_active) {
      throw new Error('แพ็กเกจนี้ไม่เปิดให้ใช้งานแล้ว');
    }

    const result = await this.sponsorService.createFromSubmission({
      activity_id: activity.id,
      tier: pkg.tier as any,
      amount: pkg.amount,
      contact_name: dto.contact_name,
      contact_phone: dto.contact_phone,
      contact_email: dto.contact_email ?? null,
      contact_line_id: dto.contact_line_id ?? null,
      brand_display_name: dto.brand_display_name,
      logo_url: dto.logo_url ?? null,
      receipt_name: dto.receipt_name ?? null,
      receipt_address: dto.receipt_address ?? null,
      tax_id: dto.tax_id ?? null,
      payment_slip: dto.payment_slip ?? null,
    });

    return result;
  }
}

