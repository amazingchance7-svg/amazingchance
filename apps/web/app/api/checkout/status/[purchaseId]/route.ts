import { NextResponse } from 'next/server';

import { readApiError } from '../../../../../lib/api';
import { authenticatedApiFetch } from '../../../../../lib/server-session';

export async function GET(
  _request: Request,
  context: { params: Promise<{ purchaseId: string }> },
) {
  const { purchaseId } = await context.params;

  const response = await authenticatedApiFetch(
    `/purchases/${encodeURIComponent(purchaseId)}`,
    { method: 'GET' },
  );

  if (!response.ok) {
    return NextResponse.json(
      { message: await readApiError(response) },
      { status: response.status },
    );
  }

  return NextResponse.json({
    purchase: await response.json(),
  });
}
