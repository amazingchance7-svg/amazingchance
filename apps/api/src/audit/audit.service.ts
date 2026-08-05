import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type {
  AuditEventRecord,
  RecordAuditEventInput,
} from './audit.types';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(
    AuditService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async record(
    input: RecordAuditEventInput,
  ): Promise<AuditEventRecord> {
    const data: Prisma.AuditLogCreateInput = {
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      correlationId: input.correlationId,
      requestId: input.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
      sealedAt: new Date(),
      ...(input.previousState !== undefined
        ? {
            previousState:
              input.previousState,
          }
        : {}),
      ...(input.newState !== undefined
        ? {
            newState: input.newState,
          }
        : {}),
      ...(input.metadata !== undefined
        ? {
            metadata: input.metadata,
          }
        : {}),
    };

    return this.prisma.auditLog.create({
      data,
      select: {
        id: true,
        actorType: true,
        actorId: true,
        action: true,
        entityType: true,
        entityId: true,
        correlationId: true,
        requestId: true,
        ipAddress: true,
        sealedAt: true,
        createdAt: true,
      },
    });
  }

  async recordSafe(
    input: RecordAuditEventInput,
  ): Promise<void> {
    try {
      await this.record(input);
    } catch (error) {
      const stack =
        error instanceof Error
          ? error.stack
          : undefined;

      this.logger.error(
        JSON.stringify({
          event:
            'AUDIT_EVENT_PERSISTENCE_FAILED',
          action: input.action,
          entityType:
            input.entityType,
          entityId: input.entityId,
          requestId:
            input.requestId ?? null,
          correlationId:
            input.correlationId,
        }),
        stack,
      );
    }
  }
}
