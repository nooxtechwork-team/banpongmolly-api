import {
  BadRequestException,
  Controller,
  Get,
  Param,
} from '@nestjs/common';
import { LegalPolicyService } from './legal-policy.service';
import { LegalPolicyType } from '../entities/legal-policy.entity';

@Controller('legal')
export class PublicLegalController {
  constructor(private readonly legalPolicyService: LegalPolicyService) {}

  @Get('summary')
  async summary() {
    return this.legalPolicyService.getPublicSummary();
  }

  @Get('document/:policyType')
  async document(@Param('policyType') policyType: string) {
    if (!Object.values(LegalPolicyType).includes(policyType as LegalPolicyType)) {
      throw new BadRequestException('ประเภทนโยบายไม่ถูกต้อง');
    }
    return this.legalPolicyService.getPublicDocument(
      policyType as LegalPolicyType,
    );
  }
}
