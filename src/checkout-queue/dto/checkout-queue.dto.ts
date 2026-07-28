import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCheckoutTicketDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activity_id: number;

  /** entry จากใบสมัครหลายใบได้ — แต่ต้องเป็น activity + user คนเดียวกัน */
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  entry_ids: number[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class ClaimNextCheckoutQueueDto {
  @IsString()
  @MaxLength(64)
  device_code: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  staff_user_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  staff_name?: string;

  /** กรอง activity เมื่อต้องการ (ไม่ส่งและเครื่องไม่ผูก = ใช้ activity ของเครื่อง) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activity_id?: number;

  /** สร้าง print job FISH_RETURN ตอน claim */
  @IsOptional()
  @IsBoolean()
  print?: boolean;
}

export class CheckoutQueueTransitionDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  device_code?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  staff_user_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  staff_name?: string;

  @IsOptional()
  @IsBoolean()
  print?: boolean;
}

export class CancelCheckoutTicketDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

/** Admin กดปิดคิวแทนพนักงาน (force complete) */
export class AdminCompleteCheckoutTicketDto {
  /** หมายเหตุ — จะถูกบันทึกลง checkout_remark ของปลาทุกตัวในใบ */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remark?: string;
}

export class UpsertCheckoutDeviceDto {
  @IsString()
  @MaxLength(64)
  device_code: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activity_id?: number | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  /** กำหนด API key เอง (ไม่ระบุ = ระบบสุ่มให้อัตโนมัติ) */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  api_key?: string;
}

export class UpdateCheckoutDeviceDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activity_id?: number | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  api_key?: string;
}

export class DeviceHeartbeatDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  device_code?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activity_id?: number;
}

/**
 * DTO สำหรับ endpoint ฝั่งเครื่อง POS (/pos/*)
 * device_code เป็น optional เพราะถ้าใช้ per-device API key ระบบจะรู้เครื่องเองอยู่แล้ว
 */
export class PosClaimNextDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  device_code?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  staff_user_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  staff_name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activity_id?: number;

  @IsOptional()
  @IsBoolean()
  print?: boolean;
}

export class PosTransitionDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  device_code?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  staff_user_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  staff_name?: string;

  @IsOptional()
  @IsBoolean()
  print?: boolean;
}
