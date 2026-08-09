import { NextResponse } from 'next/server';

import {
  API_URL,
  readApiError,
} from '../../../../lib/api';
import {
  setSession,
} from '../../../../lib/server-session';

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    status: string;
  };
};

export async function POST(
  request: Request,
) {
  const body =
    (await request.json()) as {
      email?: string;
      password?: string;
    };

  const response =
    await fetch(
      `${API_URL}/auth/login`,
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
            email:
              body.email ?? '',
            password:
              body.password ?? '',
          }),
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

  const result =
    (await response.json()) as LoginResponse;

  await setSession({
    accessToken:
      result.accessToken,
    refreshToken:
      result.refreshToken,
  });

  return NextResponse.json({
    user: result.user,
  });
}
