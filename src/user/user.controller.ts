import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateUserAdminDto } from './dto/update-user-admin.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { User } from '../entities/user.entity';
import { Audit } from '../common/decorators/audit.decorator';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, AdminGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('email') email?: string,
    @Query('phone') phone?: string,
    @Query('province_id') province_id?: string,
  ): Promise<{ items: User[]; total: number }> {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
    const limitNum = limit
      ? Math.min(100, Math.max(1, parseInt(limit, 10) || 10))
      : 10;
    const provinceId = province_id ? parseInt(province_id, 10) : undefined;
    return this.userService.findPaginated(pageNum, limitNum, {
      search: search?.trim() || undefined,
      email: email?.trim() || undefined,
      phone: phone?.trim() || undefined,
      province_id: Number.isFinite(provinceId) ? provinceId : undefined,
    });
  }

  @Get(':id')
  async getOne(@Param('id', ParseIntPipe) id: number): Promise<User> {
    return this.userService.findOne(id);
  }

  @Patch(':id')
  @Audit({ action: 'edit', entity_type: 'user', entityIdSource: 'param:id' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserAdminDto,
  ): Promise<User> {
    return this.userService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'delete', entity_type: 'user', entityIdSource: 'param:id' })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.userService.softDelete(id);
  }
}
