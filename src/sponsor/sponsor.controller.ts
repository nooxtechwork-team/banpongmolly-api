import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { SponsorService } from './sponsor.service';

@Controller('admin/sponsors')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SponsorAdminController {
  constructor(private readonly sponsorService: SponsorService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('tier') tier?: string,
    @Query('activity_id') activityId?: string,
  ): Promise<Awaited<ReturnType<typeof this.sponsorService.listAdmin>>> {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
    const limitNum = limit
      ? Math.min(100, Math.max(1, parseInt(limit, 10) || 10))
      : 10;

    return this.sponsorService.listAdmin({
      page: pageNum,
      limit: limitNum,
      search: search?.trim() || undefined,
      tier:
        tier === 'supporter' || tier === 'main' || tier === 'premium'
          ? tier
          : 'all',
      activity_id: activityId ? parseInt(activityId, 10) || undefined : undefined,
    });
  }

  @Get(':id')
  async getOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<Awaited<ReturnType<typeof this.sponsorService.findOneAdmin>>> {
    return this.sponsorService.findOneAdmin(id);
  }

  @Post()
  async create(
    @Body()
    body: {
      activity_id: number;
      tier: 'supporter' | 'main' | 'premium';
      amount: number;
      contact_name: string;
      contact_phone: string;
      contact_email?: string | null;
      contact_line_id?: string | null;
      brand_display_name: string;
      logo_url?: string | null;
      receipt_name?: string | null;
      receipt_address?: string | null;
      tax_id?: string | null;
      payment_slip?: string | null;
    },
  ): Promise<Awaited<ReturnType<typeof this.sponsorService.createAdmin>>> {
    return this.sponsorService.createAdmin(body);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: Partial<{
      activity_id: number;
      tier: 'supporter' | 'main' | 'premium';
      amount: number;
      contact_name: string;
      contact_phone: string;
      contact_email?: string | null;
      contact_line_id?: string | null;
      brand_display_name: string;
      logo_url?: string | null;
      receipt_name?: string | null;
      receipt_address?: string | null;
      tax_id?: string | null;
      payment_slip?: string | null;
    }>,
  ): Promise<Awaited<ReturnType<typeof this.sponsorService.updateAdmin>>> {
    return this.sponsorService.updateAdmin(id, body);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.sponsorService.deleteAdmin(id);
  }
}

