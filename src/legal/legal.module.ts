import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LegalPolicy } from '../entities/legal-policy.entity';
import { PolicyAcceptance } from '../entities/policy-acceptance.entity';
import { LegalPolicyService } from './legal-policy.service';
import { PublicLegalController } from './public-legal.controller';
import { AdminLegalController } from './admin-legal.controller';

@Module({
  imports: [TypeOrmModule.forFeature([LegalPolicy, PolicyAcceptance])],
  controllers: [PublicLegalController, AdminLegalController],
  providers: [LegalPolicyService],
  exports: [LegalPolicyService],
})
export class LegalModule {}
