import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateReservationDto } from './dto/create-reservation.dto.js';
import { ReservationsService } from './reservations.service.js';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Post()
  create(@Body() dto: CreateReservationDto) {
    return this.reservations.create(dto);
  }

  @Get()
  findAll() {
    return this.reservations.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reservations.findOne(id);
  }
}
