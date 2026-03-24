import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { LegalPolicyService } from './legal-policy.service';
import { CreateLegalPolicyDto } from './dto/create-legal-policy.dto';
@Controller('admin/legal')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminLegalController {
  constructor(private readonly legalPolicyService: LegalPolicyService) {}

  @Get('policies')
  async list() {
    return this.legalPolicyService.listAllForAdmin();
  }

  @Post('policies')
  async create(@Body() dto: CreateLegalPolicyDto) {
    const effectiveAt = dto.effective_at
      ? new Date(dto.effective_at)
      : undefined;
    if (effectiveAt && Number.isNaN(effectiveAt.getTime())) {
      throw new BadRequestException('รูปแบบวันที่มีผลใช้บังคับไม่ถูกต้อง');
    }
    return this.legalPolicyService.createDraft({
      policy_type: dto.policy_type,
      version: dto.version.trim(),
      title: dto.title.trim(),
      body_html: dto.body_html,
      effective_at: effectiveAt,
    });
  }

  @Post('policies/:id/activate')
  async activate(@Param('id', ParseIntPipe) id: number) {
    return this.legalPolicyService.activateVersion(id);
  }
}
