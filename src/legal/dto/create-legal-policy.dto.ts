import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { LegalPolicyType } from '../../entities/legal-policy.entity';

export class CreateLegalPolicyDto {
  @IsEnum(LegalPolicyType)
  policy_type: LegalPolicyType;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(32)
  version: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  body_html: string;

  /** ISO date string optional */
  @IsOptional()
  @IsString()
  effective_at?: string;
}
