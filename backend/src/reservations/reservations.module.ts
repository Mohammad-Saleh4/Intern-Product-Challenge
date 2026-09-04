import { Module } from '@nestjs/common';
import { ReservationExpirationService } from './reservation-expiration.service.js';
import { ReservationsController } from './reservations.controller.js';
import { ReservationsService } from './reservations.service.js';

@Module({
  controllers: [ReservationsController],
  providers: [ReservationsService, ReservationExpirationService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
