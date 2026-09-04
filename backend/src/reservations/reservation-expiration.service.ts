import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ReservationExpirationService {
  private readonly logger = new Logger(ReservationExpirationService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async expirePendingReservations(): Promise<void> {
    const now = new Date();

    try {
      const expiredReservations = await this.prisma.reservation.findMany({
        where: {
          status: 'PENDING',
          expiresAt: { lt: now },
        },
        select: {
          id: true,
          productId: true,
        },
      });

      for (const reservation of expiredReservations) {
        try {
          const expired = await this.prisma.$transaction(async (tx) => {
            const updated = await tx.reservation.updateMany({
              where: {
                id: reservation.id,
                status: 'PENDING',
                expiresAt: { lt: now },
              },
              data: { status: 'EXPIRED' },
            });

            if (updated.count === 0) {
              return false;
            }

            await tx.product.update({
              where: { id: reservation.productId },
              data: { availableQuantity: { increment: 1 } },
            });

            return true;
          });

          if (expired) {
            this.logger.log(`Expired reservation ${reservation.id}`);
          }
        } catch (error) {
          this.logger.error(
            `Failed to expire reservation ${reservation.id}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    } catch (error) {
      this.logger.error(
        'Failed to load expired reservations',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
