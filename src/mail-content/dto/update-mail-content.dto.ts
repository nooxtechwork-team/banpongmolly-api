import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MailContentToMode } from '../../entities/mail-content.entity';

export class UpdateMailContentDto {
  @IsOptional()
  @IsString()
  @MaxLength(191)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  subject?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  content_html?: string;

  @IsOptional()
  @IsString()
  content_text?: string | null;

  @IsOptional()
  @IsEnum(MailContentToMode)
  to_mode?: MailContentToMode;

  @IsOptional()
  @IsString()
  to_emails?: string | null;

  @IsOptional()
  @IsString()
  cc_emails?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}
