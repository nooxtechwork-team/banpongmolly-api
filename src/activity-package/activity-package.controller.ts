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
  UseGuards,
} from '@nestjs/common';
import {
  ActivityPackageService,
  ActivityPackageTreeNode,
  ActivityPackageWithPrice,
} from './activity-package.service';
import { CreateActivityPackageDto } from './dto/create-activity-package.dto';
import { UpdateActivityPackageDto } from './dto/update-activity-package.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ActivityPackage } from '../entities/activity-package.entity';
import { Audit } from '../common/decorators/audit.decorator';

@Controller('admin/activity-packages')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ActivityPackageController {
  constructor(
    private readonly activityPackageService: ActivityPackageService,
  ) {}

  @Get()
  async list(): Promise<ActivityPackageWithPrice[]> {
    return this.activityPackageService.findAll();
  }

  @Get('tree')
  async listTree(): Promise<ActivityPackageTreeNode[]> {
    return this.activityPackageService.findTree();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Audit({
    action: 'create',
    entity_type: 'activity_package',
    entityIdSource: 'result:id',
  })
  async create(
    @Body() dto: CreateActivityPackageDto,
  ): Promise<ActivityPackage> {
    return this.activityPackageService.create(dto);
  }

  @Patch(':id')
  @Audit({
    action: 'edit',
    entity_type: 'activity_package',
    entityIdSource: 'param:id',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateActivityPackageDto,
  ): Promise<ActivityPackage> {
    return this.activityPackageService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({
    action: 'delete',
    entity_type: 'activity_package',
    entityIdSource: 'param:id',
  })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.activityPackageService.softDelete(id);
  }
}
