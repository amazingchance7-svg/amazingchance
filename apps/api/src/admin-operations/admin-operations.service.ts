import { Injectable } from '@nestjs/common';
import {
  PaymentStatus,
  PurchaseStatus,
  TicketStatus,
  UserStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function normalizeLimit(value?: number): number {
  if (!value || !Number.isInteger(value)) {
    return DEFAULT_LIMIT;
  }

  return Math.max(1, Math.min(value, MAX_LIMIT));
}

function bigintString(value: bigint | null | undefined): string {
  return (value ?? 0n).toString();
}

@Injectable()
export class AdminOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [
      totalUsers,
      activeUsers,
      pendingUsers,
      suspendedUsers,
      totalPurchases,
      completedPurchases,
      pendingPurchases,
      failedPurchases,
      reviewPurchases,
      refundedPurchases,
      totalTickets,
      activeTickets,
      voidedTickets,
      completedVolume,
      successfulPaymentVolume,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: { status: UserStatus.ACTIVE },
      }),
      this.prisma.user.count({
        where: { status: UserStatus.PENDING_VERIFICATION },
      }),
      this.prisma.user.count({
        where: { status: UserStatus.SUSPENDED },
      }),
      this.prisma.purchase.count(),
      this.prisma.purchase.count({
        where: { status: PurchaseStatus.COMPLETED },
      }),
      this.prisma.purchase.count({
        where: {
          status: {
            in: [
              PurchaseStatus.CREATED,
              PurchaseStatus.PAYMENT_PENDING,
              PurchaseStatus.PAYMENT_CONFIRMED,
              PurchaseStatus.TICKET_ALLOCATION_PENDING,
            ],
          },
        },
      }),
      this.prisma.purchase.count({
        where: { status: PurchaseStatus.PAYMENT_FAILED },
      }),
      this.prisma.purchase.count({
        where: { status: PurchaseStatus.MANUAL_REVIEW },
      }),
      this.prisma.purchase.count({
        where: { status: PurchaseStatus.REFUNDED },
      }),
      this.prisma.ticket.count(),
      this.prisma.ticket.count({
        where: { status: TicketStatus.ACTIVE },
      }),
      this.prisma.ticket.count({
        where: { status: TicketStatus.VOIDED_BY_REFUND },
      }),
      this.prisma.purchase.groupBy({
        by: ['currency'],
        where: { status: PurchaseStatus.COMPLETED },
        _sum: { totalAmountMinor: true },
        _count: { _all: true },
        orderBy: { currency: 'asc' },
      }),
      this.prisma.payment.groupBy({
        by: ['currency'],
        where: { status: PaymentStatus.SUCCEEDED },
        _sum: { amountMinor: true },
        _count: { _all: true },
        orderBy: { currency: 'asc' },
      }),
    ]);

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        pendingVerification: pendingUsers,
        suspended: suspendedUsers,
      },
      purchases: {
        total: totalPurchases,
        completed: completedPurchases,
        inProgress: pendingPurchases,
        paymentFailed: failedPurchases,
        manualReview: reviewPurchases,
        refunded: refundedPurchases,
      },
      tickets: {
        total: totalTickets,
        active: activeTickets,
        voidedByRefund: voidedTickets,
      },
      finance: {
        completedPurchaseVolume: completedVolume.map((row) => ({
          currency: row.currency.trim(),
          amountMinor: bigintString(row._sum.totalAmountMinor),
          purchaseCount: row._count._all,
        })),
        successfulPaymentVolume: successfulPaymentVolume.map((row) => ({
          currency: row.currency.trim(),
          amountMinor: bigintString(row._sum.amountMinor),
          paymentCount: row._count._all,
        })),
      },
    };
  }

  async users(limit?: number) {
    const take = normalizeLimit(limit);

    const rows = await this.prisma.user.findMany({
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            purchases: true,
            tickets: true,
          },
        },
        roles: {
          select: {
            role: {
              select: {
                code: true,
              },
            },
          },
        },
      },
    });

    return {
      items: rows.map((user) => ({
        id: user.id,
        email: user.email,
        status: user.status,
        emailVerifiedAt: user.emailVerifiedAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        purchaseCount: user._count.purchases,
        ticketCount: user._count.tickets,
        roles: user.roles.map((entry) => entry.role.code).sort(),
      })),
      limit: take,
    };
  }

  async purchases(limit?: number) {
    const take = normalizeLimit(limit);

    const rows = await this.prisma.purchase.findMany({
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        publicId: true,
        status: true,
        requestedTicketCount: true,
        ticketPriceMinor: true,
        totalAmountMinor: true,
        currency: true,
        expiresAt: true,
        paymentConfirmedAt: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            email: true,
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
          },
        },
        _count: {
          select: {
            tickets: true,
            payments: true,
          },
        },
      },
    });

    return {
      items: rows.map((purchase) => ({
        ...purchase,
        ticketPriceMinor: purchase.ticketPriceMinor.toString(),
        totalAmountMinor: purchase.totalAmountMinor.toString(),
        currency: purchase.currency.trim(),
        ticketCount: purchase._count.tickets,
        paymentCount: purchase._count.payments,
        _count: undefined,
      })),
      limit: take,
    };
  }

  async tickets(limit?: number) {
    const take = normalizeLimit(limit);

    const rows = await this.prisma.ticket.findMany({
      take,
      orderBy: { issuedAt: 'desc' },
      select: {
        id: true,
        publicId: true,
        numberInDraw: true,
        status: true,
        issuedAt: true,
        voidedAt: true,
        voidReason: true,
        user: {
          select: {
            id: true,
            email: true,
          },
        },
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
          },
        },
      },
    });

    return {
      items: rows.map((ticket) => ({
        ...ticket,
        numberInDraw: ticket.numberInDraw.toString(),
      })),
      limit: take,
    };
  }
}
