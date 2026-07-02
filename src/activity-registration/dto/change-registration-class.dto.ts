import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ChangeRegistrationClassDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  entry_index: string;

  @Type(() => Number)
  @IsInt()
  new_package_id: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
