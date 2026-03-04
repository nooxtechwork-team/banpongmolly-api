import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateProvinceDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  image_url?: string;
}

