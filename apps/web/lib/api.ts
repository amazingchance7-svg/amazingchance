export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001';

export async function readApiError(
  response: Response,
): Promise<string> {
  try {
    const body =
      (await response.json()) as {
        message?: string | string[];
      };

    if (Array.isArray(body.message)) {
      return body.message.join(', ');
    }

    if (
      typeof body.message ===
      'string'
    ) {
      return body.message;
    }
  } catch {
    // The upstream response was not JSON.
  }

  return `Request failed with status ${response.status}`;
}
