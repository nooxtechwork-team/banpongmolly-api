import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ActivityStatus } from '../../entities/activity.entity';

export class CreateActivityDto {
  @IsOptional()
  @IsNumber()
  organizer_id?: number;

  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  date: string;

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

  @IsString()
  @MaxLength(255)
  location: string;

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
  activity_package_id?: number;

  @IsOptional()
  @IsNumber()
  max_participants?: number;

  /** หน้าปก – ใช้แสดงที่การ์ดกิจกรรม */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  image_url?: string;

  /** แบนเนอร์ – ใช้แสดงที่หน้า Detail ข้างบน */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  banner_image_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  detail_infographic_url?: string;

  @IsEnum(ActivityStatus)
  status: ActivityStatus;

  @IsOptional()
  @IsBoolean()
  is_open?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  level_label?: string;

  @IsOptional()
  @IsDateString()
  registration_deadline?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
