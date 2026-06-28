import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateHeroBannerSlideDto {
  @IsString()
  @MaxLength(512)
  image_url: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  image_url_mobile?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  link_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  alt?: string;

  @IsOptional()
  @IsBoolean()
  is_enabled?: boolean;
}
