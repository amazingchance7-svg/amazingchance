import { Logger } from '@nestjs/common';
import {
  AuditActorType,
} from '@prisma/client';

import {
  AuditActions,
  AuditEntityTypes,
} from '../../src/audit/audit-events.constants';
import { AuditService } from '../../src/audit/audit.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('AuditService recordSafe', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not propagate persistence errors', async () => {
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();

    const prisma = {
      auditLog: {
        create:
          jest.fn().mockRejectedValue(
            new Error(
              'database unavailable',
            ),
          ),
      },
    } as unknown as PrismaService;

    const service =
      new AuditService(prisma);

    await expect(
      service.recordSafe({
        actorType:
          AuditActorType.SYSTEM,
        action:
          AuditActions.AUTH_LOGIN_FAILED,
        entityType:
          AuditEntityTypes.AUTH_SESSION,
        entityId:
          'email-fingerprint',
        correlationId:
          'correlation-id',
        requestId: 'request-id',
      }),
    ).resolves.toBeUndefined();

    expect(loggerSpy).toHaveBeenCalledTimes(
      1,
    );

    const loggedMessage =
      loggerSpy.mock.calls[0][0];

    expect(loggedMessage).toContain(
      'AUDIT_EVENT_PERSISTENCE_FAILED',
    );

    expect(loggedMessage).not.toContain(
      'database unavailable',
    );
  });
});
