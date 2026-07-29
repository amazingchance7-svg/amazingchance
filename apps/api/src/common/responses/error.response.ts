import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorResponse {
  @ApiProperty({
    example: false,
    description: 'Indicates that the request was not successful',
  })
  success!: false;

  @ApiProperty({
    example: 400,
    description: 'HTTP status code',
  })
  statusCode!: number;

  @ApiProperty({
    oneOf: [
      {
        type: 'string',
        example: 'Invalid request data',
      },
      {
        type: 'array',
        items: {
          type: 'string',
        },
        example: [
          'email must be an email',
          'password must be longer than or equal to 8 characters',
        ],
      },
    ],
    description: 'Error message or validation error messages',
  })
  message!: string | string[];

  @ApiPropertyOptional({
    example: 'Bad Request',
    description: 'HTTP error name',
  })
  error?: string;

  @ApiProperty({
    example: '2026-07-29T16:20:00.000Z',
    description: 'Error timestamp',
    format: 'date-time',
  })
  timestamp!: string;

  @ApiProperty({
    example: '/api/lottery-draws',
    description: 'Request path that caused the error',
  })
  path!: string;
}