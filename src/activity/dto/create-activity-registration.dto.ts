import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CalculateEntriesDto } from './calculate-entries.dto';

export class CreateActivityRegistrationDto extends CalculateEntriesDto {
  @IsString()
  @MaxLength(255)
  applicant_name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  farm_name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsString()
  @MaxLength(50)
  phone: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  line?: string;

  @IsOptional()
  @IsString()
  note?: string;

  /** path ของสลิปที่อัปโหลดแล้ว (optional ตอนคำนวน, required ตอนบันทึกจริงให้ controller เช็คเพิ่มเอง) */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  payment_slip?: string;
}

