import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  NotificationOutboxService,
} from '../notifications/notification-outbox.service';
import {
  PrismaService,
} from '../prisma/prisma.service';
import {
  ProductionDrawSchedulerService,
} from '../workers/production-draw-scheduler.service';
import {
  ProductionPayoutReconciliationWorkerService,
} from '../workers/production-payout-reconciliation-worker.service';
import {
  ProductionPayoutWorkerService,
} from '../workers/production-payout-worker.service';

interface HealthStatus {
  status: 'ok';
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma:
      PrismaService,
    private readonly notificationOutbox:
      NotificationOutboxService,
    private readonly drawScheduler:
      ProductionDrawSchedulerService,
      private readonly payoutWorker:
      ProductionPayoutWorkerService,

    private readonly payoutReconciliationWorker:
      ProductionPayoutReconciliationWorkerService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Backward-compatible readiness check',
  })
  @ApiOkResponse({
    description:
      'Service is ready to accept traffic.',
  })
  @ApiServiceUnavailableResponse({
    description:
      'Service dependencies are not ready.',
  })
  getHealth():
    Promise<HealthStatus> {
    return this.getReadiness();
  }

  @Get('live')
  @ApiOperation({
    summary:
      'Process liveness check',
    description:
      'Confirms that the API process is running without probing external dependencies.',
  })
  @ApiOkResponse({
    description:
      'API process is alive.',
  })
  getLiveness():
    HealthStatus {
    return {
      status: 'ok',
    };
  }

  @Get('ready')
  @ApiOperation({
    summary:
      'Traffic readiness check',
    description:
      'Confirms that critical runtime dependencies required to serve traffic are available.',
  })
  @ApiOkResponse({
    description:
      'Service is ready to accept traffic.',
  })
  @ApiServiceUnavailableResponse({
    description:
      'A critical runtime dependency is unavailable.',
  })
  async getReadiness():
    Promise<HealthStatus> {
    try {
      await this.prisma
        .$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException(
        'Service is not ready',
      );
    }

    const notificationWorker =
      this.notificationOutbox
        .getOperationalStatus();

    if (
      notificationWorker.enabled &&
      !notificationWorker.healthy
    ) {
      throw new ServiceUnavailableException(
        'Service is not ready',
      );
    }

    const drawScheduler =
      this.drawScheduler
        .getOperationalStatus();

    if (
      drawScheduler.enabled &&
      !drawScheduler.healthy
    ) {
      throw new ServiceUnavailableException(
        'Service is not ready',
      );
    }

    const payoutWorker =
      this.payoutWorker
        .getOperationalStatus();

    if (
      payoutWorker.enabled &&
      !payoutWorker.healthy
    ) {
      throw new ServiceUnavailableException(
        'Service is not ready',
      );
    }

    const payoutReconciliationWorker =
      this.payoutReconciliationWorker
        .getOperationalStatus();

    if (
      payoutReconciliationWorker.enabled &&
      !payoutReconciliationWorker.healthy
    ) {
      throw new ServiceUnavailableException(
        'Service is not ready',
      );
    }

    return {
      status: 'ok',
    };
  }
}
