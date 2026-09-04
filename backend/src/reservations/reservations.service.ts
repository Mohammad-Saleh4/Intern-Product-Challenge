import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateReservationDto } from './dto/create-reservation.dto.js';

const RESERVATION_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateReservationDto) {
    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);

    return this.prisma.$transaction(async (tx) => {
      const inventory = await tx.product.updateMany({
        where: {
          id: dto.productId,
          availableQuantity: { gt: 0 },
        },
        data: {
          availableQuantity: { decrement: 1 },
        },
      });

      if (inventory.count === 0) {
        throw new ConflictException('Product is unavailable');
      }

      return tx.reservation.create({
        data: {
          productId: dto.productId,
          userId: dto.userId,
          expiresAt,
        },
        include: { product: true },
      });
    });
  }

  findAll() {
    return this.prisma.reservation.findMany({
      include: { product: true, order: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: { product: true, order: true },
    });

    if (!reservation) {
      throw new NotFoundException(`Reservation ${id} was not found`);
    }

    return reservation;
  }
}
