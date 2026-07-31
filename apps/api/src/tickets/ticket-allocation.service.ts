import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type TicketAllocation,
} from '@prisma/client';

export type ReserveTicketRangeInput = {
  purchaseId: string;
  drawId: string;
  ticketCount: number;
  correlationId: string;
};

export type ReserveTicketRangeResult = {
  allocation: TicketAllocation;
  alreadyAllocated: boolean;
};

type ReservedTicketRangeRow = {
  startNumber: bigint;
  endNumber: bigint;
};

@Injectable()
export class TicketAllocationService {
  async reserveRange(
    tx: Prisma.TransactionClient,
    input: ReserveTicketRangeInput,
  ): Promise<ReserveTicketRangeResult> {
    this.validateInput(input);

    const existingAllocation =
      await tx.ticketAllocation.findUnique({
        where: {
          purchaseId: input.purchaseId,
        },
      });

    if (existingAllocation) {
      return {
        allocation: existingAllocation,
        alreadyAllocated: true,
      };
    }

    await tx.$executeRaw`
      INSERT INTO "ticket_sequences" (
        "drawId",
        "nextNumber",
        "updatedAt"
      )
      VALUES (
        ${input.drawId}::uuid,
        1,
        NOW()
      )
      ON CONFLICT ("drawId") DO NOTHING
    `;

    const ticketCount = BigInt(input.ticketCount);

    const reservedRanges =
      await tx.$queryRaw<ReservedTicketRangeRow[]>`
        UPDATE "ticket_sequences"
        SET
          "nextNumber" = "nextNumber" + ${ticketCount},
          "updatedAt" = NOW()
        WHERE "drawId" = ${input.drawId}::uuid
        RETURNING
          "nextNumber" - ${ticketCount} AS "startNumber",
          "nextNumber" - 1 AS "endNumber"
      `;

    const reservedRange = reservedRanges[0];

    if (!reservedRange) {
      throw new Error(
        `Ticket sequence was not found for draw ${input.drawId}`,
      );
    }

    const allocation = await tx.ticketAllocation.create({
      data: {
        purchaseId: input.purchaseId,
        drawId: input.drawId,
        startNumber: reservedRange.startNumber,
        endNumber: reservedRange.endNumber,
        correlationId: input.correlationId,
      },
    });

    return {
      allocation,
      alreadyAllocated: false,
    };
  }

  private validateInput(input: ReserveTicketRangeInput): void {
    if (!input.purchaseId.trim()) {
      throw new Error(
        'purchaseId is required for ticket range reservation',
      );
    }

    if (!input.drawId.trim()) {
      throw new Error(
        'drawId is required for ticket range reservation',
      );
    }

    if (!input.correlationId.trim()) {
      throw new Error(
        'correlationId is required for ticket range reservation',
      );
    }

    if (
      !Number.isSafeInteger(input.ticketCount) ||
      input.ticketCount <= 0
    ) {
      throw new RangeError(
        'ticketCount must be a positive safe integer',
      );
    }
  }
}