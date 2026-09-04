import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(reservationId: string, userId: string) {
    const now = new Date();
    const order = await this.prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id: reservationId },
        include: { order: true },
      });

      if (!reservation) {
        throw new NotFoundException(
          `Reservation ${reservationId} was not found`,
        );
      }

      if (reservation.userId !== userId) {
        throw new ForbiddenException(
          'Reservation does not belong to this user',
        );
      }

      if (reservation.order || reservation.status !== 'PENDING') {
        throw new ConflictException('Reservation is no longer pending');
      }

      if (reservation.expiresAt <= now) {
        const expired = await tx.reservation.updateMany({
          where: { id: reservationId, status: 'PENDING' },
          data: { status: 'EXPIRED' },
        });

        if (expired.count === 1) {
          await tx.product.update({
            where: { id: reservation.productId },
            data: { availableQuantity: { increment: 1 } },
          });
        }

        return null;
      }

      const completed = await tx.reservation.updateMany({
        where: {
          id: reservationId,
          userId,
          status: 'PENDING',
          expiresAt: { gt: now },
        },
        data: { status: 'COMPLETED' },
      });

      if (completed.count === 0) {
        throw new ConflictException('Reservation is no longer available');
      }

      return tx.order.create({
        data: { reservationId },
        include: { reservation: { include: { product: true } } },
      });
    });

    if (!order) {
      throw new BadRequestException('Reservation has expired');
    }

    return order;
  }

  findAll() {
    return this.prisma.order.findMany({
      include: { reservation: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
