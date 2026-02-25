import { IsString, IsOptional, MaxLength, IsInt, Min, IsEnum, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '../../entities/user.entity';

export class UpdateUserAdminDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fullname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone_number?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  province_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  about_you?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  is_verified?: boolean;
}
