import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CheckoutDevice } from '../entities/checkout-device.entity';
import { PosApiKeyGuard } from './pos-api-key.guard';

@Module({
  imports: [TypeOrmModule.forFeature([CheckoutDevice])],
  providers: [PosApiKeyGuard],
  exports: [PosApiKeyGuard, TypeOrmModule],
})
export class PosAuthModule {}
