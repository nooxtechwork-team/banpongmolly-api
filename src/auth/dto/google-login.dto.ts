import { IsString, IsNotEmpty } from 'class-validator'

export class GoogleLoginDto {
  @IsString()
  @IsNotEmpty({ message: 'กรุณาระบุโทเคน Google' })
  idToken: string
}
