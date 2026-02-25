import { IsString, IsNotEmpty } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty({ message: 'กรุณาระบุ refresh token' })
  refresh_token: string;
}
