import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';

import type { RequestContextRequest } from '../types/request-context.type';

interface StructuredRequestLog {
  timestamp: string;
  event: 'HTTP_REQUEST_COMPLETED';
  requestId: string | null;
  correlationId: string | null;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  ip: string | null;
  userAgent: string | null;
  userId: string | null;
}

@Injectable()
export class LoggingInterceptor
  implements NestInterceptor
{
  private readonly logger = new Logger(
    LoggingInterceptor.name,
  );

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const http = context.switchToHttp();

    const request =
      http.getRequest<RequestContextRequest>();

    const response =
      http.getResponse<Response>();

    const startedAt =
      process.hrtime.bigint();

    return next.handle().pipe(
      finalize(() => {
        const finishedAt =
          process.hrtime.bigint();

        const durationMs =
          Number(
            finishedAt - startedAt,
          ) / 1_000_000;

        const log: StructuredRequestLog = {
          timestamp:
            new Date().toISOString(),
          event:
            'HTTP_REQUEST_COMPLETED',
          requestId:
            request.requestId ?? null,
          correlationId:
            request.correlationId ??
            null,
          method: request.method,
          path: request.originalUrl,
          statusCode:
            response.statusCode,
          durationMs:
            Number(
              durationMs.toFixed(3),
            ),
          ip:
            request.ip ?? null,
          userAgent:
            request.get(
              'user-agent',
            ) ?? null,
          userId:
            request.user?.id ?? null,
        };

        this.logger.log(
          JSON.stringify(log),
        );
      }),
    );
  }
}
