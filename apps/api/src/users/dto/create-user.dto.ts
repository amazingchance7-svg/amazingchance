import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'StrongPassword123',
    description:
      'User password hash or password value depending on service implementation',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  passwordHash!: string;
}