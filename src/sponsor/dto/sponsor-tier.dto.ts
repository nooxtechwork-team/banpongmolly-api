import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateSponsorTierDto {
  @IsString()
  @MaxLength(32)
  code: string;

  @IsString()
  @MaxLength(128)
  label_th: string;

  @IsString()
  @MaxLength(128)
  label_en: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateSponsorTierDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  label_th?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  label_en?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
