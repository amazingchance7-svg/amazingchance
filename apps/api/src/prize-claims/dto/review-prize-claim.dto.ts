import {
  Type,
} from 'class-transformer';
import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  PrizeEligibilityCheckStatus,
  PrizeEligibilityCheckType,
} from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class PrizeEligibilityCheckDto {
  @ApiProperty({
    enum:
      PrizeEligibilityCheckType,
  })
  @IsEnum(
    PrizeEligibilityCheckType,
  )
  type!:
    PrizeEligibilityCheckType;

  @ApiProperty({
    enum:
      PrizeEligibilityCheckStatus,
  })
  @IsEnum(
    PrizeEligibilityCheckStatus,
  )
  status!:
    PrizeEligibilityCheckStatus;

  @ApiProperty({
    type:
      'object',
    additionalProperties:
      true,
  })
  @IsObject()
  evidence!:
    Record<string, unknown>;
}

export class ReviewPrizeClaimDto {
  @ApiProperty({
    type: [
      PrizeEligibilityCheckDto,
    ],
  })
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @ValidateNested({
    each:
      true,
  })
  @Type(
    () =>
      PrizeEligibilityCheckDto,
  )
  checks!:
    PrizeEligibilityCheckDto[];

  @ApiPropertyOptional({
    description:
      'Administrative decision note',
  })
  @IsString()
  @IsOptional()
  decisionReason?:
    string;
}
