import { DrawStatus, DrawType } from '@prisma/client';
import {
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
} from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListLotteryDrawsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: DrawType,
    example: DrawType.WEEKLY,
    description: 'Filter lottery draws by type',
  })
  @IsEnum(DrawType)
  @IsOptional()
  type?: DrawType;

  @ApiPropertyOptional({
    enum: DrawStatus,
    example: DrawStatus.SCHEDULED,
    description: 'Filter lottery draws by status',
  })
  @IsEnum(DrawStatus)
  @IsOptional()
  status?: DrawStatus;
}