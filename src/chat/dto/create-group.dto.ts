import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt, IsPositive, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateGroupDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  creatorId: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  title: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @Type(() => Number)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  memberIds: number[];
}
