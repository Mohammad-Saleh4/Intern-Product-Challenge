import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateReservationDto } from './dto/create-reservation.dto.js';

const RESERVATION_TTL_MS = 15 * 60 * 1000;

type LockedProduct = {
  id: string;
  available_quantity: number;
};

@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateReservationDto) {
    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);

    return this.prisma.$transaction(async (tx) => {
      const [product] = await tx.$queryRaw<LockedProduct[]>`
        SELECT id, available_quantity
        FROM products
        WHERE id = ${dto.productId}::uuid
        FOR UPDATE
      `;

      if (!product) {
        throw new NotFoundException(`Product ${dto.productId} was not found`);
      }

      if (product.available_quantity <= 0) {
        throw new BadRequestException('Sold out');
      }

      await tx.product.update({
        where: { id: product.id },
        data: { availableQuantity: { decrement: 1 } },
      });

      return tx.reservation.create({
        data: {
          productId: dto.productId,
          userId: dto.userId,
          status: 'PENDING',
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
