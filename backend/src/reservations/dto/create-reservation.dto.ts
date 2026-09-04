import { IsUUID } from 'class-validator';

export class CreateReservationDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  userId!: string;
}
