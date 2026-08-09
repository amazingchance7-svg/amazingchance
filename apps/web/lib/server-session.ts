import 'server-only';

import { cookies } from 'next/headers';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001';

const ACCESS_COOKIE =
  'ac_access_token';
const REFRESH_COOKIE =
  'ac_refresh_token';

const ACCESS_MAX_AGE_SECONDS =
  15 * 60;
const REFRESH_MAX_AGE_SECONDS =
  30 * 24 * 60 * 60;

type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

function cookieOptions(
  maxAge: number,
) {
  return {
    httpOnly: true,
    secure:
      process.env.NODE_ENV ===
      'production',
    sameSite:
      'lax' as const,
    path: '/',
    maxAge,
  };
}

export async function setSession(
  tokens: TokenPair,
): Promise<void> {
  const store =
    await cookies();

  store.set(
    ACCESS_COOKIE,
    tokens.accessToken,
    cookieOptions(
      ACCESS_MAX_AGE_SECONDS,
    ),
  );

  store.set(
    REFRESH_COOKIE,
    tokens.refreshToken,
    cookieOptions(
      REFRESH_MAX_AGE_SECONDS,
    ),
  );
}

export async function clearSession(): Promise<void> {
  const store =
    await cookies();

  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

async function refreshAccessToken():
  Promise<string | null> {
  const store =
    await cookies();

  const refreshToken =
    store.get(
      REFRESH_COOKIE,
    )?.value;

  if (!refreshToken) {
    return null;
  }

  const response =
    await fetch(
      `${API_URL}/auth/refresh`,
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
    );

  if (!response.ok) {
    await clearSession();
    return null;
  }

  const tokens =
    (await response.json()) as TokenPair;

  await setSession(tokens);

  return tokens.accessToken;
}

export async function authenticatedApiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const store =
    await cookies();

  let accessToken =
    store.get(
      ACCESS_COOKIE,
    )?.value;

  if (!accessToken) {
    accessToken =
      await refreshAccessToken() ??
      undefined;
  }

  if (!accessToken) {
    return new Response(
      JSON.stringify({
        message:
          'Authentication required',
      }),
      {
        status: 401,
        headers: {
          'Content-Type':
            'application/json',
        },
      },
    );
  }

  const headers =
    new Headers(init.headers);

  headers.set(
    'Authorization',
    `Bearer ${accessToken}`,
  );

  headers.set(
    'Accept',
    'application/json',
  );

  let response =
    await fetch(
      `${API_URL}${path}`,
      {
        ...init,
        headers,
        cache: 'no-store',
      },
    );

  if (response.status !== 401) {
    return response;
  }

  const refreshed =
    await refreshAccessToken();

  if (!refreshed) {
    return response;
  }

  headers.set(
    'Authorization',
    `Bearer ${refreshed}`,
  );

  response =
    await fetch(
      `${API_URL}${path}`,
      {
        ...init,
        headers,
        cache: 'no-store',
      },
    );

  return response;
}

export async function getRefreshToken():
  Promise<string | null> {
  const store =
    await cookies();

  return (
    store.get(
      REFRESH_COOKIE,
    )?.value ??
    null
  );
}
