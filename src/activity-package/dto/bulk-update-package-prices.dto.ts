import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class BulkUpdatePackagePricesDto {
  /** ราคาใหม่ (บาท) — อัปเดตเฉพาะรายการในชุดที่มีราคาอยู่แล้ว */
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;
}
