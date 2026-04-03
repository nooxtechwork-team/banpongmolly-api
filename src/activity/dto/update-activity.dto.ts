import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ActivityStatus } from '../../entities/activity.entity';
import { ActivityLiveEmbedDto } from './activity-live-embed.dto';

export class UpdateActivityDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  organizer_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  start_time?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  end_time?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @IsOptional()
  @IsString()
  location_address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  location_google_maps_url?: string;

  @IsOptional()
  @IsNumber()
  location_latitude?: number;

  @IsOptional()
  @IsNumber()
  location_longitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  contact_info?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  province_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  activity_package_id?: number;

  @IsOptional()
  @IsNumber()
  max_participants?: number;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  image_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  banner_image_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  detail_infographic_url?: string;

  @IsOptional()
  @IsEnum(ActivityStatus)
  status?: ActivityStatus;

  @IsOptional()
  @IsBoolean()
  is_open?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  level_label?: string;

  @IsOptional()
  @IsDateString()
  registration_open_at?: string;

  @IsOptional()
  @IsDateString()
  registration_deadline?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => ActivityLiveEmbedDto)
  live_embeds?: ActivityLiveEmbedDto[];

  /** สรุปผลการแข่งขัน (object → เก็บเป็น JSON) ส่ง null เพื่อล้างค่า */
  @IsOptional()
  @Allow()
  competition_dashboard?: Record<string, unknown> | null;
}
