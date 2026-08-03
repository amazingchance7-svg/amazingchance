import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class UpdateLotteryDrawDto {
  @ApiPropertyOptional({ example: '2026-08-02T18:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  scheduledDrawAt?: string;

  @ApiPropertyOptional({ example: '2026-07-29T18:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  salesOpenAt?: string;

  @ApiPropertyOptional({ example: '2026-08-02T17:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  salesCloseAt?: string;

  @ApiPropertyOptional({ example: 'USD' })
  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be a three-letter uppercase code',
  })
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ example: '100', pattern: '^[1-9]\\d*$' })
  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message: 'ticketPriceMinor must be a positive integer string',
  })
  @IsOptional()
  ticketPriceMinor?: string;

  @ApiPropertyOptional({ example: 3, minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  winnerCount?: number;

  @ApiPropertyOptional({ example: 2026, minimum: 2000, maximum: 9999 })
  @IsInt()
  @Min(2000)
  @Max(9999)
  @IsOptional()
  participationYear?: number;
}
