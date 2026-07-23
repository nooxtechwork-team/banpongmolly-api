import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrintJobType } from '../../entities/print-job.entity';

export class CreateQueueTicketDto {
  @IsOptional()
  @IsString()
  @MaxLength(191)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  target_device_id?: string;

  @IsOptional()
  @IsIn([
    PrintJobType.QUEUE_TICKET,
    PrintJobType.FISH_RETURN,
    PrintJobType.CUSTOM,
  ])
  job_type?: PrintJobType;
}

export class CreatePrintJobDto {
  @IsString()
  @MaxLength(4000)
  payload_text: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  label?: string;

  @IsOptional()
  @IsIn(Object.values(PrintJobType))
  job_type?: PrintJobType;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  target_device_id?: string;
}

export class ClaimPrintJobDto {
  @IsString()
  @MaxLength(64)
  device_id: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  target_device_id?: string;
}

export class CompletePrintJobDto {
  @IsString()
  @MaxLength(64)
  device_id: string;

  @IsOptional()
  @IsIn(['done', 'failed'])
  status?: 'done' | 'failed';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  error?: string;
}
