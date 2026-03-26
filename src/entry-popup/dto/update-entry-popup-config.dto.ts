import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateEntryPopupConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  title?: string | null;

  @IsOptional()
  @IsString()
  body?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  image_url?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  button_label?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  button_url?: string | null;

  @IsOptional()
  @IsIn(['all', 'guests_only'])
  audience?: string;
}
