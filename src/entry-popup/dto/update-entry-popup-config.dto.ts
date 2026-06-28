import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateEntryPopupConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  image_url?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  link_url?: string | null;

  @IsOptional()
  @IsIn(['all', 'guests_only'])
  audience?: string;

  @IsOptional()
  @IsBoolean()
  show_dismiss_checkbox?: boolean;

  @IsOptional()
  @IsBoolean()
  dismiss_on_close?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  reshow_after_days?: number | null;
}
