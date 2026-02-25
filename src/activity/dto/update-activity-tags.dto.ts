import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateActivityTagsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

