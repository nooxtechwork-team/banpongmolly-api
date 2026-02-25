import { IsString, IsNotEmpty } from 'class-validator'

export class VerifyEmailDto {
  @IsString()
  @IsNotEmpty({ message: 'กรุณาระบุโทเคนยืนยันตัวตน' })
  token: string
}
