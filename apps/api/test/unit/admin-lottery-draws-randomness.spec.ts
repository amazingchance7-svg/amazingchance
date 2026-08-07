import { REQUIRED_PERMISSIONS_KEY } from '../../src/authorization/authorization.constants';
import { Permissions } from '../../src/authorization/permissions.constants';
import {
  AuditActions,
  AuditEntityTypes,
} from '../../src/audit/audit-events.constants';
import { AdminLotteryDrawsController } from '../../src/lottery-draws/admin-lottery-draws.controller';

describe('AdminLotteryDrawsController randomness', () => {
  const verifiedAt =
    new Date('2026-08-07T09:00:00.000Z');

  const result = {
    evidenceId:
      '11111111-1111-4111-8111-111111111111',
    drawId:
      '22222222-2222-4222-8222-222222222222',
    drawPublicId:
      'W-2026-001',
    provider:
      'RANDOM_ORG',
    attemptNumber: 1,
    requestedMin: '1',
    requestedMax: '100',
    requestedCount: 3,
    randomPositions: [
      '7',
      '42',
      '81',
    ],
    responseHash:
      'a'.repeat(64),
    providerSignature:
      'signed-provider-response',
    signatureVerified:
      true as const,
    verifiedAt,
    alreadyVerified:
      false,
  };

  function createController(
    randomnessResult = result,
  ) {
    const lotteryDrawsService = {};
    const snapshotBuilderService = {};
    const snapshotFinalizerService = {};

    const randomnessEvidenceService = {
      requestAndVerify:
        jest.fn()
          .mockResolvedValue(
            randomnessResult,
          ),
    };

    const winnerSelectionService = {};

    const auditService = {
      recordSafe:
        jest.fn()
          .mockResolvedValue(
            undefined,
          ),
    };

    const controller =
      new AdminLotteryDrawsController(
        lotteryDrawsService as never,
        snapshotBuilderService as never,
        snapshotFinalizerService as never,
        randomnessEvidenceService as never,
        winnerSelectionService as never,
        auditService as never,
      );

    return {
      controller,
      randomnessEvidenceService,
      auditService,
    };
  }

  it('requires draw.request_randomness permission', () => {
    const permissions =
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        AdminLotteryDrawsController
          .prototype
          .requestRandomness,
      );

    expect(permissions).toEqual([
      Permissions.DRAW_REQUEST_RANDOMNESS,
    ]);
  });

  it('requests randomness and records verification audit event', async () => {
    const {
      controller,
      randomnessEvidenceService,
      auditService,
    } = createController();

    const request = {
      user: {
        id: 'admin-user-id',
      },
      requestId:
        'request-id',
      correlationId:
        'correlation-id',
      ip: '127.0.0.1',
    };

    const response =
      await controller.requestRandomness(
        result.drawId,
        request as never,
      );

    expect(response).toEqual(
      result,
    );

    expect(
      randomnessEvidenceService
        .requestAndVerify,
    ).toHaveBeenCalledWith(
      result.drawId,
    );

    expect(
      auditService.recordSafe,
    ).toHaveBeenCalledWith({
      actorType: 'ADMIN',
      actorId:
        'admin-user-id',
      action:
        AuditActions
          .DRAW_RANDOMNESS_VERIFIED,
      entityType:
        AuditEntityTypes
          .RANDOMNESS_EVIDENCE,
      entityId:
        result.evidenceId,
      requestId:
        'request-id',
      correlationId:
        'correlation-id',
      ipAddress:
        '127.0.0.1',
      newState: {
        drawStatus:
          'RANDOMNESS_VERIFIED',
        signatureVerified:
          true,
        verifiedAt:
          verifiedAt.toISOString(),
      },
      metadata: {
        drawId:
          result.drawId,
        drawPublicId:
          result.drawPublicId,
        provider:
          'RANDOM_ORG',
        attemptNumber:
          1,
        requestedMin:
          '1',
        requestedMax:
          '100',
        requestedCount:
          3,
        responseHash:
          result.responseHash,
        providerSignature:
          result.providerSignature,
        randomPositions: [
          '7',
          '42',
          '81',
        ],
        alreadyVerified:
          false,
      },
    });
  });

  it('records replay audit event for existing verified evidence', async () => {
    const replayResult = {
      ...result,
      alreadyVerified:
        true,
    };

    const {
      controller,
      auditService,
    } = createController(
      replayResult,
    );

    await controller.requestRandomness(
      result.drawId,
      {
        user: {
          id: 'admin-user-id',
        },
        requestId:
          'request-id',
        correlationId:
          'correlation-id',
        ip: '127.0.0.1',
      } as never,
    );

    expect(
      auditService.recordSafe,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        action:
          AuditActions
            .DRAW_RANDOMNESS_REPLAYED,
        entityType:
          AuditEntityTypes
            .RANDOMNESS_EVIDENCE,
        entityId:
          result.evidenceId,
        metadata:
          expect.objectContaining({
            alreadyVerified:
              true,
          }),
      }),
    );
  });
});
