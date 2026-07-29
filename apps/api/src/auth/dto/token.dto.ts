import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
} from 'class-validator';

export class TokenDto {
  @ApiProperty({
    example:
      'e0a6db0b-64a3-44db-93d2-xxxxxxxxxxxx',
    description: 'Verification token',
  })
  @IsString()
  @IsNotEmpty()
  token!: string;
}