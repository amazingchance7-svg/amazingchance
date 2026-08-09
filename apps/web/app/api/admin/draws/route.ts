import { NextResponse } from 'next/server';

import { readApiError } from '../../../../lib/api';
import { authenticatedApiFetch } from '../../../../lib/server-session';

export async function GET() {
  const response = await authenticatedApiFetch('/lottery-draws?limit=100', {
    method: 'GET',
  });

  if (!response.ok) {
    return NextResponse.json(
      { message: await readApiError(response) },
      { status: response.status },
    );
  }

  return NextResponse.json(await response.json());
}
