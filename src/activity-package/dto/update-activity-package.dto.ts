import { IsInt, IsOptional, IsString, MaxLength, Min, IsNumber } from 'class-validator';

export class UpdateActivityPackageDto {
  @IsOptional()
  @IsString()
  @MaxLength(191)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  slug?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  parent_id?: number | null;

  @IsOptional()
  @IsInt()
  sort_order?: number;

  @IsOptional()
  is_active?: boolean;

  @IsOptional()
  @IsNumber()
  price?: number;
}
