import {
  AuditActorType,
  Prisma,
} from '@prisma/client';

import {
  AuditActions,
  AuditEntityTypes,
} from '../../src/audit/audit-events.constants';
import { AuditService } from '../../src/audit/audit.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('AuditService', () => {
  it('creates and immediately seals an audit event', async () => {
    const createdAt = new Date();
    const create = jest.fn().mockResolvedValue({
      id: 'audit-id',
      actorType:
        AuditActorType.ADMIN,
      actorId: 'admin-id',
      action:
        AuditActions.DRAW_PUBLISHED,
      entityType:
        AuditEntityTypes.LOTTERY_DRAW,
      entityId: 'draw-id',
      correlationId:
        'correlation-id',
      requestId: 'request-id',
      ipAddress: '127.0.0.1',
      sealedAt: createdAt,
      createdAt,
    });

    const prisma = {
      auditLog: {
        create,
      },
    } as unknown as PrismaService;

    const service =
      new AuditService(prisma);

    const result = await service.record({
      actorType:
        AuditActorType.ADMIN,
      actorId: 'admin-id',
      action:
        AuditActions.DRAW_PUBLISHED,
      entityType:
        AuditEntityTypes.LOTTERY_DRAW,
      entityId: 'draw-id',
      correlationId:
        'correlation-id',
      requestId: 'request-id',
      ipAddress: '127.0.0.1',
      previousState: {
        status: 'COMPLETED',
      },
      newState: {
        status: 'PUBLISHED',
      },
      metadata: {
        source: 'admin-api',
      },
    });

    expect(result.id).toBe('audit-id');

    expect(create).toHaveBeenCalledTimes(1);

    const invocation =
      create.mock.calls[0][0] as {
        data: Prisma.AuditLogCreateInput;
      };

    expect(invocation.data).toMatchObject({
      actorType:
        AuditActorType.ADMIN,
      actorId: 'admin-id',
      action:
        AuditActions.DRAW_PUBLISHED,
      entityType:
        AuditEntityTypes.LOTTERY_DRAW,
      entityId: 'draw-id',
      correlationId:
        'correlation-id',
      requestId: 'request-id',
      ipAddress: '127.0.0.1',
      previousState: {
        status: 'COMPLETED',
      },
      newState: {
        status: 'PUBLISHED',
      },
      metadata: {
        source: 'admin-api',
      },
    });

    expect(
      invocation.data.sealedAt,
    ).toBeInstanceOf(Date);
  });

  it('stores optional context as null when absent', async () => {
    const create =
      jest.fn().mockResolvedValue({
        id: 'audit-id',
        actorType:
          AuditActorType.SYSTEM,
        actorId: null,
        action:
          AuditActions.SNAPSHOT_BUILD_STARTED,
        entityType:
          AuditEntityTypes.SNAPSHOT,
        entityId: 'snapshot-id',
        correlationId:
          'correlation-id',
        requestId: null,
        ipAddress: null,
        sealedAt: new Date(),
        createdAt: new Date(),
      });

    const service = new AuditService({
      auditLog: {
        create,
      },
    } as unknown as PrismaService);

    await service.record({
      actorType:
        AuditActorType.SYSTEM,
      action:
        AuditActions.SNAPSHOT_BUILD_STARTED,
      entityType:
        AuditEntityTypes.SNAPSHOT,
      entityId: 'snapshot-id',
      correlationId:
        'correlation-id',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: null,
          requestId: null,
          ipAddress: null,
        }),
      }),
    );
  });
});
