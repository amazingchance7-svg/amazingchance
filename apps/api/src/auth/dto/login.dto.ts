import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'StrongPassword123',
    description: 'User password',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({
    example: '123456',
    description:
      'TOTP code required for privileged accounts with MFA enabled',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  mfaCode?: string;
}
