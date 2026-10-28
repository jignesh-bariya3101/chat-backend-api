import { Type } from 'class-transformer';
import { IsInt, IsPositive } from 'class-validator';

export class AddMemberDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  userId: number;
}
