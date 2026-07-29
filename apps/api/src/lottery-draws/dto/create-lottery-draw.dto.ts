import { DrawType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({
    enum: DrawType,
    example: DrawType.WEEKLY,
    description: 'Lottery draw type',
  })
  @IsEnum(DrawType)
  type!: DrawType;

  @ApiProperty({
    example: '2026-08-02T18:00:00.000Z',
    description: 'Scheduled draw date and time in ISO 8601 format',
  })
  @IsDateString()
  scheduledDrawAt!: string;

  @ApiPropertyOptional({
    example: '2026-07-29T18:00:00.000Z',
    description: 'Ticket sales opening date and time in ISO 8601 format',
  })
  @IsDateString()
  @IsOptional()
  salesOpenAt?: string;

  @ApiPropertyOptional({
    example: '2026-08-02T17:00:00.000Z',
    description: 'Ticket sales closing date and time in ISO 8601 format',
  })
  @IsDateString()
  @IsOptional()
  salesCloseAt?: string;

  @ApiPropertyOptional({
    example: 'USD',
    description: 'Three-letter uppercase ISO currency code',
    minLength: 3,
    maxLength: 3,
  })
  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be a three-letter uppercase code',
  })
  @IsOptional()
  currency?: string;

  @ApiProperty({
    example: '100',
    description:
      'Ticket price in the smallest currency unit, represented as a positive integer string',
    pattern: '^[1-9]\\d*$',
  })
  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message: 'ticketPriceMinor must be a positive integer string',
  })
  ticketPriceMinor!: string;

  @ApiPropertyOptional({
    example: 3,
    description: 'Number of winners selected in the draw',
    minimum: 1,
    maximum: 100,
  })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  winnerCount?: number;

  @ApiPropertyOptional({
    example: 2026,
    description: 'Participation year used for annual draw eligibility',
    minimum: 2000,
    maximum: 9999,
  })
  @IsInt()
  @Min(2000)
  @Max(9999)
  @IsOptional()
  participationYear?: number;
}