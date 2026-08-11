import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

type TicketFixtureClient = Pick<
  Prisma.TransactionClient,
  'purchase' | 'ticketAllocation'
>;

export async function ensureTestTicketAllocation(
  client: TicketFixtureClient,
  input: {
    purchaseId: string;
    drawId: string;
    numberInDraw: bigint;
  },
): Promise<void> {
  const purchase = await client.purchase.findUniqueOrThrow({
    where: { id: input.purchaseId },
    select: {
      drawId: true,
      requestedTicketCount: true,
    },
  });

  if (purchase.drawId !== input.drawId) {
    throw new Error(
      'Test ticket draw does not match its purchase',
    );
  }

  const count = BigInt(
    purchase.requestedTicketCount,
  );

  const existing =
    await client.ticketAllocation.findUnique({
      where: {
        purchaseId: input.purchaseId,
      },
    });

  if (!existing) {
    await client.ticketAllocation.create({
      data: {
        purchaseId: input.purchaseId,
        drawId: input.drawId,
        startNumber: input.numberInDraw,
        endNumber:
          input.numberInDraw + count - 1n,
        correlationId: randomUUID(),
      },
    });
    return;
  }

  if (existing.drawId !== input.drawId) {
    throw new Error(
      'Existing test allocation belongs to another draw',
    );
  }

  if (
    input.numberInDraw >= existing.startNumber &&
    input.numberInDraw <= existing.endNumber
  ) {
    return;
  }

  const minimum =
    input.numberInDraw < existing.startNumber
      ? input.numberInDraw
      : existing.startNumber;

  const maximum =
    input.numberInDraw > existing.endNumber
      ? input.numberInDraw
      : existing.endNumber;

  if (maximum - minimum + 1n > count) {
    throw new Error(
      'Test tickets exceed requested ticket count',
    );
  }

  await client.ticketAllocation.update({
    where: {
      purchaseId: input.purchaseId,
    },
    data: {
      startNumber: minimum,
      endNumber: minimum + count - 1n,
    },
  });
}
