import {
  ApiProperty,
} from '@nestjs/swagger';
import {
  IsString,
  Matches,
} from 'class-validator';

export class MfaCodeDto {
  @ApiProperty({
    example: '123456',
    description:
      'Six-digit authenticator TOTP code',
  })
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}
