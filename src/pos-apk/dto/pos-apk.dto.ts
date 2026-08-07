import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SetPosApkPasswordDto {
  @IsString()
  @MinLength(4)
  @MaxLength(128)
  password: string;
}

export class UnlockPosApkDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}

export class UploadPosApkMetaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  version_name: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  notes?: string;
}
