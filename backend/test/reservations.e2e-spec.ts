import { randomUUID } from 'node:crypto';
import { jest } from '@jest/globals';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Reservations concurrency (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let productId: string | undefined;

  jest.setTimeout(30_000);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (productId) {
      await prisma.reservation.deleteMany({ where: { productId } });
      await prisma.product.deleteMany({ where: { id: productId } });
    }

    await app.close();
  });

  it('allows exactly five of ten simultaneous reservations for five items', async () => {
    const product = await prisma.product.create({
      data: {
        name: `Concurrency test ${randomUUID()}`,
        totalQuantity: 5,
        availableQuantity: 5,
        price: '100.00',
      },
    });
    productId = product.id;

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app.getHttpServer()).post('/reservations').send({
          productId: product.id,
          userId: randomUUID(),
        }),
      ),
    );

    const succeeded = responses.filter((response) => response.status === 201);
    const soldOut = responses.filter((response) => response.status === 400);

    expect(succeeded).toHaveLength(5);
    expect(soldOut).toHaveLength(5);
    expect(
      soldOut.every((response) => response.body.message === 'Sold out'),
    ).toBe(true);

    const inventory = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { availableQuantity: true },
    });
    expect(inventory.availableQuantity).toBe(0);
  });
});
