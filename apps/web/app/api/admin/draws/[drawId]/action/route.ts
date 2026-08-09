import { NextResponse } from 'next/server';

import { readApiError } from '../../../../../../lib/api';
import { authenticatedApiFetch } from '../../../../../../lib/server-session';

const ACTION_PATHS = {
  'open-sales': 'open-sales',
  'close-sales': 'close-sales',
  'build-snapshot': 'build-snapshot',
  'finalize-snapshot': 'finalize-snapshot',
  'request-randomness': 'request-randomness',
  'select-winners': 'select-winners',
  cancel: 'cancel',
  publish: 'publish',
} as const;

type AdminDrawAction = keyof typeof ACTION_PATHS;

function isAdminDrawAction(value: unknown): value is AdminDrawAction {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(ACTION_PATHS, value)
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ drawId: string }> },
) {
  const { drawId } = await context.params;

  let body: { action?: unknown };

  try {
    body = (await request.json()) as { action?: unknown };
  } catch {
    return NextResponse.json(
      { message: 'Invalid JSON request body' },
      { status: 400 },
    );
  }

  if (!isAdminDrawAction(body.action)) {
    return NextResponse.json(
      { message: 'Unsupported admin draw action' },
      { status: 400 },
    );
  }

  const response = await authenticatedApiFetch(
    `/admin/lottery-draws/${encodeURIComponent(drawId)}/${ACTION_PATHS[body.action]}`,
    { method: 'POST' },
  );

  if (!response.ok) {
    return NextResponse.json(
      { message: await readApiError(response) },
      { status: response.status },
    );
  }

  return NextResponse.json(await response.json());
}
