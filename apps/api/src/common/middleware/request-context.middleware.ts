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

const REQUEST_ID_HEADER = 'x-request-id';
const CORRELATION_ID_HEADER =
  'x-correlation-id';

function normalizeHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  const candidate = Array.isArray(value)
    ? value[0]
    : value;

  if (!candidate) {
    return undefined;
  }

  const normalized = candidate
    .trim()
    .slice(0, 128);

  return normalized.length > 0
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
    const suppliedRequestId =
      normalizeHeaderValue(
        request.headers[
          REQUEST_ID_HEADER
        ],
      );

    const suppliedCorrelationId =
      normalizeHeaderValue(
        request.headers[
          CORRELATION_ID_HEADER
        ],
      );

    const requestId =
      suppliedRequestId ?? randomUUID();

    const correlationId =
      suppliedCorrelationId ??
      suppliedRequestId ??
      requestId;

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
