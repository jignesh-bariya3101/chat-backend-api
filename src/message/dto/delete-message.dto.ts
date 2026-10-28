import { Type } from 'class-transformer';
import { IsInt, IsPositive } from 'class-validator';

export class DeleteMessageDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  senderId: number;
}
