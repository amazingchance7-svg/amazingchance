import {
  Controller,
  Get,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Health check',
    description:
      'Returns the current API status and verifies database connectivity.',
  })
  @ApiOkResponse({
    description: 'Service is healthy.',
  })
  async getHealth(): Promise<{
    status: 'ok';
    service: string;
    database: 'connected';
    timestamp: string;
    responseTimeMs: number;
  }> {
    const startedAt = Date.now();

    await this.prisma.$queryRaw`SELECT 1`;

    return {
      status: 'ok',
      service: 'amazing-chance-api',
      database: 'connected',
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startedAt,
    };
  }
}