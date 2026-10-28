import { Type } from 'class-transformer';
import { IsInt, IsPositive } from 'class-validator';

export class CreateChatDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  userAId: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  userBId: number;
}
