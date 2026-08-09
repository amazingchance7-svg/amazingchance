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

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: 'Invalid JSON request body' },
      { status: 400 },
    );
  }

  const response = await authenticatedApiFetch('/admin/lottery-draws', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return NextResponse.json(
      { message: await readApiError(response) },
      { status: response.status },
    );
  }

  return NextResponse.json(await response.json(), { status: 201 });
}
