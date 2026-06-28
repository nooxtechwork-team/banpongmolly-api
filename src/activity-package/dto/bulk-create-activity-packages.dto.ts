import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateActivityPackageDto } from './create-activity-package.dto';

export class BulkCreateActivityPackagesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateActivityPackageDto)
  packages: CreateActivityPackageDto[];
}
