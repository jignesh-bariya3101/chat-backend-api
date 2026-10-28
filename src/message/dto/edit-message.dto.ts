import { Transform, Type } from 'class-transformer';
import { IsInt, IsPositive, IsString, MaxLength, MinLength } from 'class-validator';

export class EditMessageDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  senderId: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text: string;
}
