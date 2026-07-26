import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { PrintJobService } from './print-job.service';
import { PosApiKeyGuard } from '../pos-auth/pos-api-key.guard';
import {
  ClaimPrintJobDto,
  CompletePrintJobDto,
  CreatePrintJobDto,
  CreateQueueTicketDto,
} from './dto/print-job.dto';

@Controller('print-jobs')
@UseInterceptors(ResponseInterceptor)
export class PrintJobController {
  constructor(private readonly printJobService: PrintJobService) {}

  /** Recent jobs (admin log) */
  @Get()
  @UseGuards(JwtAuthGuard, AdminGuard)
  list(@Query('limit') limit?: string) {
    const n = limit ? Number(limit) : 30;
    return this.printJobService.listRecent(Number.isFinite(n) ? n : 30);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.printJobService.getOne(id);
  }

  /** Admin / desk: create next queue number + print job */
  @Post('queue-ticket')
  @UseGuards(JwtAuthGuard, AdminGuard)
  createQueueTicket(@Body() dto: CreateQueueTicketDto) {
    return this.printJobService.createQueueTicket(dto);
  }

  /** Enqueue arbitrary slip text */
  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  create(@Body() dto: CreatePrintJobDto) {
    return this.printJobService.createCustom(dto);
  }

  /** POS device: claim next pending job */
  @Post('claim')
  @UseGuards(PosApiKeyGuard)
  claim(@Body() dto: ClaimPrintJobDto) {
    return this.printJobService.claim(dto);
  }

  /** POS device: mark printed or failed */
  @Post(':id/complete')
  @UseGuards(PosApiKeyGuard)
  complete(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompletePrintJobDto,
  ) {
    return this.printJobService.complete(id, dto);
  }

  /** Admin: put job back in queue for reprint */
  @Post(':id/requeue')
  @UseGuards(JwtAuthGuard, AdminGuard)
  requeue(@Param('id', ParseIntPipe) id: number) {
    return this.printJobService.requeue(id);
  }
}
