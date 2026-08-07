import { REQUIRED_PERMISSIONS_KEY } from '../../src/authorization/authorization.constants';
import { Permissions } from '../../src/authorization/permissions.constants';
import {
  AuditActions,
  AuditEntityTypes,
} from '../../src/audit/audit-events.constants';
import { AdminLotteryDrawsController } from '../../src/lottery-draws/admin-lottery-draws.controller';

describe('AdminLotteryDrawsController winner selection', () => {
  const completedAt =
    new Date('2026-08-07T06:00:00.000Z');

  const result = {
    drawId:
      '11111111-1111-4111-8111-111111111111',
    drawPublicId:
      'W-2026-001',
    status: 'COMPLETED' as const,
    randomnessEvidenceId:
      '22222222-2222-4222-8222-222222222222',
    snapshotId:
      '33333333-3333-4333-8333-333333333333',
    snapshotHash:
      'a'.repeat(64),
    merkleRoot:
      'b'.repeat(64),
    completedAt,
    alreadyCompleted: false,
    winners: [
      {
        id:
          '44444444-4444-4444-8444-444444444444',
        rank: 1,
        ticketId:
          '55555555-5555-4555-8555-555555555555',
        ticketPublicId:
          'TKT-001',
        ownerPublicRef:
          'owner-ref-001',
        snapshotEntryId:
          '66666666-6666-4666-8666-666666666666',
        randomPosition: '7',
      },
    ],
  };

  function createController(
    winnerResult = result,
  ) {
    const lotteryDrawsService = {};
    const snapshotBuilderService = {};
    const snapshotFinalizerService = {};

    const winnerSelectionService = {
      finalize: jest
        .fn()
        .mockResolvedValue(
          winnerResult,
        ),
    };

    const auditService = {
      recordSafe: jest
        .fn()
        .mockResolvedValue(
          undefined,
        ),
    };

    const controller =
      new AdminLotteryDrawsController(
        lotteryDrawsService as never,
        snapshotBuilderService as never,
        snapshotFinalizerService as never,
        winnerSelectionService as never,
        auditService as never,
      );

    return {
      controller,
      winnerSelectionService,
      auditService,
    };
  }

  it('requires draw.select_winners permission', () => {
    const permissions =
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        AdminLotteryDrawsController
          .prototype
          .selectWinners,
      );

    expect(permissions).toEqual([
      Permissions.DRAW_SELECT_WINNERS,
    ]);
  });

  it('selects winners and records completion audit event', async () => {
    const {
      controller,
      winnerSelectionService,
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
      await controller.selectWinners(
        result.drawId,
        request as never,
      );

    expect(response).toEqual(
      result,
    );

    expect(
      winnerSelectionService.finalize,
    ).toHaveBeenCalledWith(
      result.drawId,
    );

    expect(
      auditService.recordSafe,
    ).toHaveBeenCalledWith({
      actorType: 'ADMIN',
      actorId: 'admin-user-id',
      action:
        AuditActions
          .DRAW_WINNER_SELECTION_COMPLETED,
      entityType:
        AuditEntityTypes.LOTTERY_DRAW,
      entityId:
        result.drawId,
      requestId:
        'request-id',
      correlationId:
        'correlation-id',
      ipAddress:
        '127.0.0.1',
      newState: {
        status:
          'COMPLETED',
        completedAt:
          completedAt.toISOString(),
      },
      metadata: {
        drawPublicId:
          result.drawPublicId,
        randomnessEvidenceId:
          result.randomnessEvidenceId,
        snapshotId:
          result.snapshotId,
        snapshotHash:
          result.snapshotHash,
        merkleRoot:
          result.merkleRoot,
        alreadyCompleted:
          false,
        winnerCount: 1,
        winners: [
          {
            rank: 1,
            ticketPublicId:
              'TKT-001',
            ownerPublicRef:
              'owner-ref-001',
            snapshotEntryId:
              '66666666-6666-4666-8666-666666666666',
            randomPosition:
              '7',
          },
        ],
      },
    });
  });

  it('records replay audit event for an already completed draw', async () => {
    const replayResult = {
      ...result,
      alreadyCompleted: true,
    };

    const {
      controller,
      auditService,
    } = createController(
      replayResult,
    );

    await controller.selectWinners(
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
            .DRAW_WINNER_SELECTION_REPLAYED,
        metadata:
          expect.objectContaining({
            alreadyCompleted:
              true,
          }),
      }),
    );
  });
});
