import { Type } from 'class-transformer';
import { IsInt, IsPositive } from 'class-validator';

export class MarkReadDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  userId: number;
}
