import { IsUUID } from 'class-validator';

export class CreateOrderDto {
  @IsUUID()
  reservationId!: string;

  @IsUUID()
  userId!: string;
}
