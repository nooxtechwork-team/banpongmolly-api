import {
  ArrayMaxSize,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SponsorSocialDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(32)
  type: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  label: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(512)
  url: string;
}

export class CreateSponsorRegistrationDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  contact_name: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  contact_phone: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  contact_email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  contact_line_id?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  brand_display_name: string;

  @IsNotEmpty()
  @IsNumber()
  activity_id: number;

  @IsNotEmpty()
  @IsNumber()
  sponsor_package_id: number;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  logo_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  receipt_name?: string;

  @IsOptional()
  @IsString()
  receipt_address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  tax_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  payment_slip?: string;

  /**
   * ช่องทาง social media สูงสุด 2 ช่องทาง
   */
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SponsorSocialDto)
  @ArrayMaxSize(2)
  socials?: SponsorSocialDto[];
}

