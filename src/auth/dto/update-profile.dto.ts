import { IsString, IsOptional, MaxLength, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fullname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  farm_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  contact_address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  line_id?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  province_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  about_you?: string;
}
