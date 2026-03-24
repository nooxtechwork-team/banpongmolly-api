import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AcceptPoliciesDto {
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean({ message: 'กรุณายืนยันการยอมรับนโยบาย' })
  accept_policies: boolean;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  terms_policy_version: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  privacy_policy_version: string;
}
