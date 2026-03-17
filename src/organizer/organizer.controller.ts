import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrganizerService } from './organizer.service';
import type { UpsertOrganizerDto } from './organizer.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { Organizer } from '../entities/organizer.entity';
import { Audit } from '../common/decorators/audit.decorator';

@Controller('admin/organizers')
@UseGuards(JwtAuthGuard, AdminGuard)
export class OrganizerController {
  constructor(private readonly organizerService: OrganizerService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{ items: Organizer[]; total: number } | Organizer[]> {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : undefined;
    const limitNum = limit
      ? Math.min(100, Math.max(1, parseInt(limit, 10) || 10))
      : undefined;
    if (pageNum !== undefined && limitNum !== undefined) {
      return this.organizerService.findPaginated(pageNum, limitNum);
    }
    return this.organizerService.findAll();
  }

  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number): Promise<Organizer> {
    return this.organizerService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Audit({
    action: 'create',
    entity_type: 'organizer',
    entityIdSource: 'result:id',
  })
  async create(@Body() dto: UpsertOrganizerDto): Promise<Organizer> {
    return this.organizerService.create(dto);
  }

  @Patch(':id')
  @Audit({
    action: 'edit',
    entity_type: 'organizer',
    entityIdSource: 'param:id',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<UpsertOrganizerDto>,
  ): Promise<Organizer> {
    return this.organizerService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({
    action: 'delete',
    entity_type: 'organizer',
    entityIdSource: 'param:id',
  })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.organizerService.softDelete(id);
  }
}
