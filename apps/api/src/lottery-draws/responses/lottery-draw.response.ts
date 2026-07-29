import {
    DrawStatus,
    DrawType,
  } from '@prisma/client';
  import {
    ApiProperty,
    ApiPropertyOptional,
  } from '@nestjs/swagger';
  
  export class LotteryDrawResponse {
    @ApiProperty({
      example: '7f94ca4c-b62f-4b52-972d-e05fa0c2d8ec',
      description: 'Internal lottery draw UUID',
      format: 'uuid',
    })
    id!: string;
  
    @ApiProperty({
      example: 'W-2026-000001',
      description: 'Public lottery draw identifier',
    })
    publicId!: string;
  
    @ApiProperty({
      enum: DrawType,
      example: DrawType.WEEKLY,
      description: 'Lottery draw type',
    })
    type!: DrawType;
  
    @ApiProperty({
      example: 1,
      description: 'Sequential number within the draw type',
    })
    sequenceNumber!: number;
  
    @ApiPropertyOptional({
      example: 2026,
      nullable: true,
      description: 'Participation year used for annual draw eligibility',
    })
    participationYear!: number | null;
  
    @ApiProperty({
      enum: DrawStatus,
      example: DrawStatus.SCHEDULED,
      description: 'Current lottery draw status',
    })
    status!: DrawStatus;
  
    @ApiPropertyOptional({
      example: '2026-07-29T18:00:00.000Z',
      nullable: true,
      description: 'Ticket sales opening date and time',
      format: 'date-time',
    })
    salesOpenAt!: Date | null;
  
    @ApiPropertyOptional({
      example: '2026-08-02T17:00:00.000Z',
      nullable: true,
      description: 'Ticket sales closing date and time',
      format: 'date-time',
    })
    salesCloseAt!: Date | null;
  
    @ApiProperty({
      example: '2026-08-02T18:00:00.000Z',
      description: 'Scheduled lottery draw date and time',
      format: 'date-time',
    })
    scheduledDrawAt!: Date;
  
    @ApiProperty({
      example: 'USD',
      description: 'Three-letter ISO currency code',
    })
    currency!: string;
  
    @ApiProperty({
      example: '100',
      description:
        'Ticket price in the smallest currency unit, represented as a string',
    })
    ticketPriceMinor!: string;
  
    @ApiProperty({
      example: 3,
      description: 'Number of winners selected in the draw',
    })
    winnerCount!: number;
  
    @ApiProperty({
      example: '2026-07-29T14:00:00.000Z',
      description: 'Lottery draw creation timestamp',
      format: 'date-time',
    })
    createdAt!: Date;
  
    @ApiProperty({
      example: '2026-07-29T14:00:00.000Z',
      description: 'Lottery draw last update timestamp',
      format: 'date-time',
    })
    updatedAt!: Date;
  }