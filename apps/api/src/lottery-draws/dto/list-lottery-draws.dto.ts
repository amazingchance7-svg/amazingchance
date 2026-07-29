import { DrawStatus, DrawType } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListLotteryDrawsDto extends PaginationQueryDto {
  @IsEnum(DrawType)
  @IsOptional()
  type?: DrawType;

  @IsEnum(DrawStatus)
  @IsOptional()
  status?: DrawStatus;
}