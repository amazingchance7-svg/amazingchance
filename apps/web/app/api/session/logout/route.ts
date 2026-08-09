import { NextResponse } from 'next/server';

import {
  API_URL,
} from '../../../../lib/api';
import {
  clearSession,
  getRefreshToken,
} from '../../../../lib/server-session';

export async function POST() {
  const refreshToken =
    await getRefreshToken();

  if (refreshToken) {
    await fetch(
      `${API_URL}/auth/logout`,
      {
        method: 'POST',
        headers: {
          Accept:
            'application/json',
          'Content-Type':
            'application/json',
        },
        body:
          JSON.stringify({
            refreshToken,
          }),
        cache: 'no-store',
      },
    ).catch(() => undefined);
  }

  await clearSession();

  return NextResponse.json({
    success: true,
  });
}
