import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrdersService } from './orders.service.js';

@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('checkout')
  create(@Body() dto: CreateOrderDto) {
    return this.orders.create(dto.reservationId, dto.userId);
  }

  @Get('orders')
  findAll() {
    return this.orders.findAll();
  }
}
