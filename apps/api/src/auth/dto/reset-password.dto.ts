import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    example:
      'e0a6db0b-64a3-44db-93d2-xxxxxxxxxxxx',
    description: 'Password reset token',
  })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({
    example: 'StrongPassword123',
    description: 'New password',
    minLength: 8,
    maxLength: 128,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/[a-z]/, {
    message:
      'Password must contain a lowercase letter',
  })
  @Matches(/[A-Z]/, {
    message:
      'Password must contain an uppercase letter',
  })
  @Matches(/[0-9]/, {
    message: 'Password must contain a number',
  })
  password!: string;
}