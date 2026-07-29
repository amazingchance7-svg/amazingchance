import { DrawType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateLotteryDrawDto {
  @IsEnum(DrawType)
  type!: DrawType;

  @IsDateString()
  scheduledDrawAt!: string;

  @IsDateString()
  @IsOptional()
  salesOpenAt?: string;

  @IsDateString()
  @IsOptional()
  salesCloseAt?: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be a three-letter uppercase code',
  })
  @IsOptional()
  currency?: string;

  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message: 'ticketPriceMinor must be a positive integer string',
  })
  ticketPriceMinor!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  winnerCount?: number;

  @IsInt()
  @Min(2000)
  @Max(9999)
  @IsOptional()
  participationYear?: number;
}