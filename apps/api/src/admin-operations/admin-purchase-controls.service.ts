import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  PaymentStatus,
  Prisma,
  PurchaseStatus,
} from '@prisma/client';

import { createCorrelationId } from '../common/utils/identifier.util';
import { PrismaService } from '../prisma/prisma.service';

type ControlResult = {
  purchaseId: string;
  publicId: string;
  fromStatus: PurchaseStatus;
  toStatus: PurchaseStatus;
  correlationId: string;
  alreadyApplied: boolean;
};

@Injectable()
export class AdminPurchaseControlsService {
  constructor(private readonly prisma: PrismaService) {}

  async markManualReview(
    purchaseId: string,
    reason: string,
    actorId: string | null,
  ): Promise<ControlResult> {
    return this.prisma.$transaction(
      async (tx) => {
        const purchase = await tx.purchase.findUnique({
          where: { id: purchaseId },
          include: {
            payments: {
              select: { status: true },
            },
            _count: {
              select: { tickets: true },
            },
          },
        });

        if (!purchase) {
          throw new NotFoundException('Purchase not found');
        }

        if (purchase.status === PurchaseStatus.MANUAL_REVIEW) {
          return {
            purchaseId: purchase.id,
            publicId: purchase.publicId,
            fromStatus: PurchaseStatus.MANUAL_REVIEW,
            toStatus: PurchaseStatus.MANUAL_REVIEW,
            correlationId: 'already-in-manual-review',
            alreadyApplied: true,
          };
        }

        const eligibleForManualReview =
          purchase.status === PurchaseStatus.PAYMENT_PENDING ||
          purchase.status === PurchaseStatus.PAYMENT_FAILED;

        if (!eligibleForManualReview) {
          throw new ConflictException(
            `Purchase in ${purchase.status} cannot be moved to manual review`,
          );
        }

        if (
          purchase.payments.some(
            (payment) => payment.status === PaymentStatus.SUCCEEDED,
          )
        ) {
          throw new ConflictException(
            'A purchase with a succeeded payment cannot be moved to manual review by this control',
          );
        }

        if (purchase._count.tickets > 0) {
          throw new ConflictException(
            'A purchase with issued tickets cannot be moved to manual review by this control',
          );
        }

        const correlationId = createCorrelationId();
        const now = new Date();

        const updated = await tx.purchase.updateMany({
          where: {
            id: purchase.id,
            status: purchase.status,
          },
          data: {
            status: PurchaseStatus.MANUAL_REVIEW,
          },
        });

        if (updated.count !== 1) {
          throw new ConflictException(
            'Purchase state changed while manual review was being applied',
          );
        }

        await tx.purchaseStateEvent.create({
          data: {
            purchaseId: purchase.id,
            fromStatus: purchase.status,
            toStatus: PurchaseStatus.MANUAL_REVIEW,
            cause: 'ADMIN_MANUAL_REVIEW',
            source: AuditActorType.ADMIN,
            correlationId,
            sealedAt: now,
            metadata: {
              actorId,
              reason: reason.trim(),
            },
          },
        });

        return {
          purchaseId: purchase.id,
          publicId: purchase.publicId,
          fromStatus: purchase.status,
          toStatus: PurchaseStatus.MANUAL_REVIEW,
          correlationId,
          alreadyApplied: false,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async cancelManualReview(
    purchaseId: string,
    reason: string,
    actorId: string | null,
  ): Promise<ControlResult> {
    return this.prisma.$transaction(
      async (tx) => {
        const purchase = await tx.purchase.findUnique({
          where: { id: purchaseId },
          include: {
            payments: {
              select: { status: true },
            },
            _count: {
              select: { tickets: true },
            },
          },
        });

        if (!purchase) {
          throw new NotFoundException('Purchase not found');
        }

        if (purchase.status === PurchaseStatus.CANCELLED) {
          return {
            purchaseId: purchase.id,
            publicId: purchase.publicId,
            fromStatus: PurchaseStatus.CANCELLED,
            toStatus: PurchaseStatus.CANCELLED,
            correlationId: 'already-cancelled',
            alreadyApplied: true,
          };
        }

        if (purchase.status !== PurchaseStatus.MANUAL_REVIEW) {
          throw new ConflictException(
            'Only a MANUAL_REVIEW purchase can be cancelled by this control',
          );
        }

        if (
          purchase.payments.some(
            (payment) =>
              payment.status === PaymentStatus.SUCCEEDED ||
              payment.status === PaymentStatus.REFUND_PENDING ||
              payment.status === PaymentStatus.PARTIALLY_REFUNDED ||
              payment.status === PaymentStatus.REFUNDED,
          )
        ) {
          throw new ConflictException(
            'A purchase with successful or refunding payment activity cannot be cancelled by this control',
          );
        }

        if (purchase._count.tickets > 0) {
          throw new ConflictException(
            'A purchase with issued tickets cannot be cancelled by this control',
          );
        }

        const correlationId = createCorrelationId();
        const now = new Date();

        const updated = await tx.purchase.updateMany({
          where: {
            id: purchase.id,
            status: PurchaseStatus.MANUAL_REVIEW,
          },
          data: {
            status: PurchaseStatus.CANCELLED,
          },
        });

        if (updated.count !== 1) {
          throw new ConflictException(
            'Purchase state changed while cancellation was being applied',
          );
        }

        await tx.purchaseStateEvent.create({
          data: {
            purchaseId: purchase.id,
            fromStatus: PurchaseStatus.MANUAL_REVIEW,
            toStatus: PurchaseStatus.CANCELLED,
            cause: 'ADMIN_MANUAL_REVIEW_CANCELLED',
            source: AuditActorType.ADMIN,
            correlationId,
            sealedAt: now,
            metadata: {
              actorId,
              reason: reason.trim(),
            },
          },
        });

        return {
          purchaseId: purchase.id,
          publicId: purchase.publicId,
          fromStatus: PurchaseStatus.MANUAL_REVIEW,
          toStatus: PurchaseStatus.CANCELLED,
          correlationId,
          alreadyApplied: false,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }
}
