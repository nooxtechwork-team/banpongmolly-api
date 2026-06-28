import { ArrayMinSize, IsArray, IsInt } from 'class-validator';

export class ReorderHeroBannerSlidesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  ids: number[];
}
