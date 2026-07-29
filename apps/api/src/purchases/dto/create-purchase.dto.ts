import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class CreatePurchaseDto {
  @IsUUID()
  drawId!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  requestedTicketCount!: number;
}