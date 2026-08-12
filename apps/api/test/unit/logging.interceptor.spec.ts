import {
  CallHandler,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  lastValueFrom,
  of,
} from 'rxjs';

import { LoggingInterceptor } from '../../src/common/interceptors/logging.interceptor';
import type { RequestContextRequest } from '../../src/common/types/request-context.type';

describe('LoggingInterceptor', () => {
  it('does not log query-string secrets', async () => {
    const interceptor =
      new LoggingInterceptor();

    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation();

    const request = {
      method: 'GET',
      path: '/verify',
      originalUrl:
        '/verify?token=super-secret-token',
      requestId:
        '11111111-1111-4111-8111-111111111111',
      correlationId:
        'verification-flow',
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue(
        'jest-agent',
      ),
    } as unknown as RequestContextRequest;

    const response = {
      statusCode: 200,
    } as Response;

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;

    const next = {
      handle: () => of({ ok: true }),
    } as CallHandler;

    await lastValueFrom(
      interceptor.intercept(
        context,
        next,
      ),
    );

    expect(logSpy).toHaveBeenCalledTimes(1);

    const serialized =
      String(
        logSpy.mock.calls[0]?.[0],
      );

    const parsed =
      JSON.parse(serialized) as {
        path: string;
      };

    expect(parsed.path).toBe('/verify');

    expect(serialized).not.toContain(
      'super-secret-token',
    );

    logSpy.mockRestore();
  });
});
