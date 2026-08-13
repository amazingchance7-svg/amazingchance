import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class StartSelfExclusionDto {
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}