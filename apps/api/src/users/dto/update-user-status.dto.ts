import { UserStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export class UpdateUserStatusDto {
  @ApiProperty({
    enum: UserStatus,
    example: UserStatus.ACTIVE,
    description: 'Current user account status',
  })
  @IsEnum(UserStatus)
  status!: UserStatus;
}