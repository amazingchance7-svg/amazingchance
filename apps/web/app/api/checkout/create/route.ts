import {
  randomUUID,
} from 'node:crypto';
import { NextResponse } from 'next/server';

import {
  readApiError,
} from '../../../../lib/api';
import {
  authenticatedApiFetch,
} from '../../../../lib/server-session';

type PurchaseResponse = {
  id: string;
  publicId: string;
  drawId: string;
  status: string;
  requestedTicketCount: number;
  ticketPriceMinor: string;
  totalAmountMinor: string;
  currency: string;
  expiresAt: string | null;
};

type PaymentIntentResponse = {
  purchaseId: string;
  paymentId: string;
  paymentAttemptId: string;
  provider: 'STRIPE';
  paymentIntentId: string;
  clientSecret: string;
  amountMinor: string;
  currency: string;
  status: string;
  expiresAt: string | null;
};

export async function POST(
  request: Request,
) {
  const body =
    (await request.json()) as {
      drawId?: string;
      ticketCount?: number;
    };

  const drawId =
    body.drawId?.trim() ?? '';

  const ticketCount =
    Number(
      body.ticketCount,
    );

  if (
    !drawId ||
    !Number.isInteger(
      ticketCount,
    ) ||
    ticketCount <= 0
  ) {
    return NextResponse.json(
      {
        message:
          'A valid draw ID and positive ticket count are required.',
      },
      {
        status: 400,
      },
    );
  }

  const purchaseResponse =
    await authenticatedApiFetch(
      '/purchases',
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json',
          'Idempotency-Key':
            `web-checkout-${randomUUID()}`,
        },
        body:
          JSON.stringify({
            drawId,
            requestedTicketCount:
              ticketCount,
          }),
      },
    );

  if (
    !purchaseResponse.ok
  ) {
    return NextResponse.json(
      {
        message:
          await readApiError(
            purchaseResponse,
          ),
      },
      {
        status:
          purchaseResponse.status,
      },
    );
  }

  const purchase =
    (await purchaseResponse.json()) as PurchaseResponse;

  const paymentResponse =
    await authenticatedApiFetch(
      `/purchases/${encodeURIComponent(
        purchase.id,
      )}/payment-intent`,
      {
        method: 'POST',
      },
    );

  if (!paymentResponse.ok) {
    return NextResponse.json(
      {
        message:
          await readApiError(
            paymentResponse,
          ),
        purchase,
      },
      {
        status:
          paymentResponse.status,
      },
    );
  }

  const payment =
    (await paymentResponse.json()) as PaymentIntentResponse;

  return NextResponse.json({
    purchase,
    payment,
  });
}
