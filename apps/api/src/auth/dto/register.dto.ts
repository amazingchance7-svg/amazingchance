import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'StrongPassword123',
    description:
      'Password containing uppercase, lowercase letters and numbers',
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