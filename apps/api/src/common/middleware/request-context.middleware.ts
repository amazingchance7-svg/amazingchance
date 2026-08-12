import {
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import type {
  NextFunction,
  Response,
} from 'express';
import { randomUUID } from 'node:crypto';

import type { RequestContextRequest } from '../types/request-context.type';

const CORRELATION_ID_HEADER =
  'x-correlation-id';

const SAFE_CORRELATION_ID =
  /^[A-Za-z0-9._:-]{1,128}$/;

function normalizeCorrelationId(
  value: string | string[] | undefined,
): string | undefined {
  const candidate = Array.isArray(value)
    ? value[0]
    : value;

  if (!candidate) {
    return undefined;
  }

  const normalized = candidate.trim();

  return SAFE_CORRELATION_ID.test(normalized)
    ? normalized
    : undefined;
}

@Injectable()
export class RequestContextMiddleware
  implements NestMiddleware
{
  use(
    request: RequestContextRequest,
    response: Response,
    next: NextFunction,
  ): void {
    const requestId = randomUUID();

    const correlationId =
      normalizeCorrelationId(
        request.headers[
          CORRELATION_ID_HEADER
        ],
      ) ?? requestId;

    request.requestId = requestId;
    request.correlationId =
      correlationId;

    response.setHeader(
      'X-Request-ID',
      requestId,
    );

    response.setHeader(
      'X-Correlation-ID',
      correlationId,
    );

    next();
  }
}
