import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DrawStatus,
  TicketStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

const MY_TICKETS_LIMIT = 100;

type TicketRecord = {
  id: string;
  publicId: string;
  numberInDraw: bigint;
  status: TicketStatus;
  issuedAt: Date;
  voidedAt: Date | null;
  voidReason: string | null;
  purchase: {
    id: string;
    publicId: string;
    status: string;
  };
  draw: {
    id: string;
    publicId: string;
    type: string;
    status: DrawStatus;
    scheduledDrawAt: Date;
    completedAt: Date | null;
    publishedAt: Date | null;
    currency: string;
  };
  snapshotEntries: Array<{
    position: bigint;
  }>;
};

export type UserTicketView = {
  id: string;
  publicId: string;
  numberInDraw: string;
  status: TicketStatus;
  issuedAt: Date;
  voidedAt: Date | null;
  voidReason: string | null;
  purchase: {
    id: string;
    publicId: string;
    status: string;
  };
  draw: {
    id: string;
    publicId: string;
    type: string;
    status: DrawStatus;
    scheduledDrawAt: Date;
    completedAt: Date | null;
    publishedAt: Date | null;
    currency: string;
  };
  verification: {
    includedInSnapshot: boolean;
    snapshotPosition: string | null;
    publicVerificationAvailable: boolean;
  };
};

@Injectable()
export class TicketsQueryService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  async findMine(
    userId: string,
  ): Promise<{
    tickets: UserTicketView[];
    limit: number;
  }> {
    const tickets =
      await this.prisma.ticket.findMany({
        where: {
          userId,
        },
        include: {
          purchase: {
            select: {
              id: true,
              publicId: true,
              status: true,
            },
          },
          draw: {
            select: {
              id: true,
              publicId: true,
              type: true,
              status: true,
              scheduledDrawAt: true,
              completedAt: true,
              publishedAt: true,
              currency: true,
            },
          },
          snapshotEntries: {
            select: {
              position: true,
            },
            take: 1,
          },
        },
        orderBy: [
          {
            issuedAt: 'desc',
          },
          {
            id: 'desc',
          },
        ],
        take:
          MY_TICKETS_LIMIT,
      });

    return {
      tickets:
        tickets.map((ticket) =>
          this.serializeTicket(
            ticket,
          ),
        ),
      limit:
        MY_TICKETS_LIMIT,
    };
  }

  async findForPurchase(
    userId: string,
    purchaseId: string,
  ): Promise<{
    purchase: {
      id: string;
      publicId: string;
      status: string;
      requestedTicketCount: number;
      completedAt: Date | null;
    };
    tickets: UserTicketView[];
  }> {
    const purchase =
      await this.prisma.purchase.findFirst({
        where: {
          id:
            purchaseId,
          userId,
        },
        select: {
          id: true,
          publicId: true,
          status: true,
          requestedTicketCount: true,
          completedAt: true,
        },
      });

    if (!purchase) {
      throw new NotFoundException(
        'Purchase not found',
      );
    }

    const tickets =
      await this.prisma.ticket.findMany({
        where: {
          purchaseId:
            purchase.id,
          userId,
        },
        include: {
          purchase: {
            select: {
              id: true,
              publicId: true,
              status: true,
            },
          },
          draw: {
            select: {
              id: true,
              publicId: true,
              type: true,
              status: true,
              scheduledDrawAt: true,
              completedAt: true,
              publishedAt: true,
              currency: true,
            },
          },
          snapshotEntries: {
            select: {
              position: true,
            },
            take: 1,
          },
        },
        orderBy: {
          numberInDraw:
            'asc',
        },
      });

    return {
      purchase,
      tickets:
        tickets.map((ticket) =>
          this.serializeTicket(
            ticket,
          ),
        ),
    };
  }

  private serializeTicket(
    ticket: TicketRecord,
  ): UserTicketView {
    const snapshotEntry =
      ticket.snapshotEntries[0];

    return {
      id:
        ticket.id,
      publicId:
        ticket.publicId,
      numberInDraw:
        ticket.numberInDraw.toString(),
      status:
        ticket.status,
      issuedAt:
        ticket.issuedAt,
      voidedAt:
        ticket.voidedAt,
      voidReason:
        ticket.voidReason,
      purchase:
        ticket.purchase,
      draw:
        ticket.draw,
      verification: {
        includedInSnapshot:
          Boolean(snapshotEntry),
        snapshotPosition:
          snapshotEntry
            ? snapshotEntry.position.toString()
            : null,
        publicVerificationAvailable:
          ticket.draw.status ===
            DrawStatus.PUBLISHED &&
          Boolean(snapshotEntry),
      },
    };
  }
}
