import { Type } from 'class-transformer';
import { DrawStatus, DrawType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class ListLotteryDrawsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 20;

  @IsEnum(DrawType)
  @IsOptional()
  type?: DrawType;

  @IsEnum(DrawStatus)
  @IsOptional()
  status?: DrawStatus;
}