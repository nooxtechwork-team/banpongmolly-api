import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MailContentToMode } from '../../entities/mail-content.entity';

export class CreateMailContentDto {
  @IsOptional()
  @IsString()
  @MaxLength(191)
  name?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  subject: string;

  @IsString()
  @MinLength(1)
  content_html: string;

  @IsOptional()
  @IsString()
  content_text?: string;

  @IsOptional()
  @IsEnum(MailContentToMode)
  to_mode?: MailContentToMode;

  @IsOptional()
  @IsString()
  to_emails?: string;

  @IsOptional()
  @IsString()
  cc_emails?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
