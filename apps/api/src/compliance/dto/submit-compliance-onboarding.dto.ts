import { IsDateString, IsString, Length, Matches } from 'class-validator';

export class SubmitComplianceOnboardingDto {
  @IsDateString()
  dateOfBirth!: string;

  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Za-z]{2}$/)
  countryCode!: string;

  @IsString()
  @Length(1, 80)
  identityProvider!: string;

  @IsString()
  @Length(1, 255)
  identityEvidenceRef!: string;
}