import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentConfig } from '../entities/payment-config.entity';
import { PaymentConfigService } from './payment-config.service';
import { PaymentConfigController } from './payment-config.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PaymentConfig])],
  providers: [PaymentConfigService],
  controllers: [PaymentConfigController],
  exports: [PaymentConfigService],
})
export class PaymentConfigModule {}

