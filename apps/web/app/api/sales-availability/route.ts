import {
  NextResponse,
} from 'next/server';

import {
  API_URL,
  readApiError,
} from '../../../lib/api';

export async function GET() {
  const response = await fetch(
    `${API_URL}/lottery-draws/sales-availability`,
    {
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    return NextResponse.json(
      {
        message:
          await readApiError(
            response,
          ),
      },
      {
        status:
          response.status,
      },
    );
  }

  return NextResponse.json(
    await response.json(),
  );
}
