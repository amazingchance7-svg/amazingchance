import { ApiProperty } from '@nestjs/swagger';

export class PaginationResponse {
  @ApiProperty({
    example: 1,
    description: 'Current page number',
  })
  page!: number;

  @ApiProperty({
    example: 20,
    description: 'Number of items per page',
  })
  limit!: number;

  @ApiProperty({
    example: 145,
    description: 'Total number of items',
  })
  total!: number;

  @ApiProperty({
    example: 8,
    description: 'Total number of pages',
  })
  totalPages!: number;
}