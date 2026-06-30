import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Transform } from 'class-transformer';
import { CalculateEntriesDto } from '../../activity/dto/calculate-entries.dto';

export class CreateOnsiteRegistrationDto extends CalculateEntriesDto {
  @Type(() => Number)
  @IsInt()
  activity_id: number;

  @Type(() => Number)
  @IsInt()
  user_id: number;

  @IsString()
  @MaxLength(255)
  applicant_name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  farm_name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsString()
  @MaxLength(50)
  phone: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  line?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cash_received_amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  onsite_note?: string;

  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean({ message: 'กรุณายอมรับนโยบายและข้อกำหนดก่อนสมัคร' })
  accept_policies: boolean;

  @IsString()
  @MaxLength(32)
  terms_policy_version: string;

  @IsString()
  @MaxLength(32)
  privacy_policy_version: string;
}

export class ConfirmOnsiteCashDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cash_received_amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  onsite_note?: string;
}

export class RejectOnsiteCashDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}
