import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateContactMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(191)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  subject?: string;

  @IsString()
  @MaxLength(2000)
  message: string;
}


