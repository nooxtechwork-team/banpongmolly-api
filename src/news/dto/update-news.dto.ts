import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { NewsCategory } from '../../entities/news.entity';

export class UpdateNewsDto {
  @IsOptional()
  @IsString()
  @MaxLength(191)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  excerpt?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsEnum(NewsCategory)
  category?: NewsCategory;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  thumbnail_url?: string;

  @IsOptional()
  @IsDateString()
  published_at?: string;

  @IsOptional()
  @IsBoolean()
  is_published?: boolean;
}
