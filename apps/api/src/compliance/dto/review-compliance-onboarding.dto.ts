import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewComplianceOnboardingDto {
  @IsIn(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}