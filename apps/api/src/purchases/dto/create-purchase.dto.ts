import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class CreatePurchaseDto {
  @ApiProperty({
    example: '7f94ca4c-b62f-4b52-972d-e05fa0c2d8ec',
    description: 'Unique identifier of the lottery draw',
    format: 'uuid',
  })
  @IsUUID()
  drawId!: string;

  @ApiProperty({
    example: 5,
    description: 'Number of lottery tickets requested for purchase',
    minimum: 1,
    maximum: 100,
  })
  @IsInt()
  @Min(1)
  @Max(100)
  requestedTicketCount!: number;
}