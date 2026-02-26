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
import { SponsorPackageService } from './sponsor-package.service';

@Controller('admin/sponsor-packages')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SponsorPackageAdminController {
  constructor(private readonly pkgService: SponsorPackageService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('tier') tier?: string,
    @Query('is_active') isActive?: string,
  ) {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
    const limitNum = limit
      ? Math.min(100, Math.max(1, parseInt(limit, 10) || 20))
      : 20;

    return this.pkgService.listAdmin({
      page: pageNum,
      limit: limitNum,
      search: search?.trim() || undefined,
      tier: tier || undefined,
      is_active:
        isActive === 'true'
          ? true
          : isActive === 'false'
          ? false
          : undefined,
    });
  }

  @Post()
  async create(
    @Body()
    body: {
      code: string;
      name: string;
      amount: number;
      tier: string;
      description?: string | null;
    },
  ) {
    return this.pkgService.create(body);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: Partial<{
      code: string;
      name: string;
      amount: number;
      tier: string;
      description: string | null;
      is_active: boolean;
    }>,
  ) {
    return this.pkgService.update(id, body);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.pkgService.softDelete(id);
  }
}

