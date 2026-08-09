import { NextResponse } from 'next/server';

import { readApiError } from '../../../../../lib/api';
import { authenticatedApiFetch } from '../../../../../lib/server-session';

const ALLOWED_RESOURCES = new Set([
  'overview',
  'users',
  'purchases',
  'tickets',
]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ resource: string }> },
) {
  const { resource } = await context.params;

  if (!ALLOWED_RESOURCES.has(resource)) {
    return NextResponse.json(
      { message: 'Unsupported admin operations resource' },
      { status: 404 },
    );
  }

  const response = await authenticatedApiFetch(
    `/admin/operations/${resource}`,
    { method: 'GET' },
  );

  if (!response.ok) {
    return NextResponse.json(
      { message: await readApiError(response) },
      { status: response.status },
    );
  }

  return NextResponse.json(await response.json());
}
