import {
  ApiProperty,
} from '@nestjs/swagger';
import {
  IsDateString,
  IsString,
  Matches,
} from 'class-validator';

export class SubmitPrizeClaimDto {
  @ApiProperty({
    example:
      '1990-05-15',
    description:
      'Claimant-declared date of birth',
  })
  @IsDateString()
  declaredDateOfBirth!: string;

  @ApiProperty({
    example:
      'UA',
    description:
      'Two-letter uppercase country code',
  })
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  declaredCountryCode!: string;
}
