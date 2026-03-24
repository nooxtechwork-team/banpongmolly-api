import {
  ArrayMaxSize,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ActivityLiveEmbedDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsString()
  @IsIn(['youtube', 'facebook', 'tiktok', 'instagram', 'other'])
  platform: string;

  @IsString()
  @MaxLength(2048)
  embed_url: string;
}
