import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateHeroBannerSlideDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  image_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  image_url_mobile?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  link_url?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  alt?: string | null;

  @IsOptional()
  @IsBoolean()
  is_enabled?: boolean;
}
