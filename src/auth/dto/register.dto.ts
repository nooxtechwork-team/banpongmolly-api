import {
  IsEmail,
  IsString,
  MinLength,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterDto {
  @IsEmail()
  @IsNotEmpty({ message: 'กรุณากรอกอีเมล' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' })
  @IsNotEmpty({ message: 'กรุณากรอกรหัสผ่าน' })
  password: string;

  @IsString()
  @IsNotEmpty({ message: 'กรุณากรอกชื่อ-นามสกุล' })
  fullname: string;

  @IsString()
  @IsOptional()
  phone_number?: string;

  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean({ message: 'กรุณายอมรับข้อกำหนดและเงื่อนไข' })
  accepted_terms: boolean;

  @IsString()
  @IsOptional()
  privacy_policy_version?: string;
}
