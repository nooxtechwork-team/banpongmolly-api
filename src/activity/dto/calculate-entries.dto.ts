import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  Min,
  ValidateNested,
} from 'class-validator';

export class RegistrationEntryDto {
  @IsInt()
  @Min(1)
  package_id: number;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class CalculateEntriesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RegistrationEntryDto)
  entries: RegistrationEntryDto[];
}

