import { IsString, Length, MaxLength } from 'class-validator';

export class ComplianceControlDto {
  @IsString()
  @Length(1, 500)
  @MaxLength(500)
  reason!: string;
}