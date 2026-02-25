import {
  IsInt,
  IsString,
  IsOptional,
  MaxLength,
  Min,
  Max,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ActivityRewardItemDto {
  @IsInt()
  @Min(1)
  @Max(3)
  rank_order: number;

  @IsString()
  @MaxLength(255)
  title: string;

  @IsString()
  @MaxLength(512)
  prize_description: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  status?: string;
}

export class UpsertActivityRewardsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActivityRewardItemDto)
  rewards: ActivityRewardItemDto[];
}
