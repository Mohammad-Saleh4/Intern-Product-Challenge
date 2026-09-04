import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumberString, IsString, Min } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  totalQuantity!: number;

  @IsNumberString()
  price!: string;
}
