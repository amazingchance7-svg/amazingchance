import { NextResponse } from 'next/server';

import { readApiError } from '../../../../../../../lib/api';
import { authenticatedApiFetch } from '../../../../../../../lib/server-session';

type PurchaseControlAction =
  | 'manual-review'
  | 'cancel-manual-review';

const ALLOWED_ACTIONS = new Set<PurchaseControlAction>([
  'manual-review',
  'cancel-manual-review',
]);

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      purchaseId: string;
    }>;
  },
) {
  const { purchaseId } = await context.params;

  let body: {
    action?: string;
    reason?: string;
  };

  try {
    body = (await request.json()) as {
      action?: string;
      reason?: string;
    };
  } catch {
    return NextResponse.json(
      { message: 'Request body must be valid JSON' },
      { status: 400 },
    );
  }

  if (
    typeof body.action !== 'string' ||
    !ALLOWED_ACTIONS.has(body.action as PurchaseControlAction)
  ) {
    return NextResponse.json(
      { message: 'Unsupported purchase control action' },
      { status: 400 },
    );
  }

  if (
    typeof body.reason !== 'string' ||
    body.reason.trim().length < 3
  ) {
    return NextResponse.json(
      { message: 'A reason of at least 3 characters is required' },
      { status: 400 },
    );
  }

  const response = await authenticatedApiFetch(
    `/admin/operations/purchases/${encodeURIComponent(
      purchaseId,
    )}/${body.action}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reason: body.reason.trim(),
      }),
    },
  );

  if (!response.ok) {
    return NextResponse.json(
      { message: await readApiError(response) },
      { status: response.status },
    );
  }

  return NextResponse.json(await response.json());
}
