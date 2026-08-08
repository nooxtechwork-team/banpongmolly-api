import { ArrayMinSize, IsArray, IsInt } from 'class-validator';

export class ReorderHomepageFeaturedDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  ids: number[];
}
