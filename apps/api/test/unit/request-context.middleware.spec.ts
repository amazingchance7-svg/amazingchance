import type {
  NextFunction,
  Response,
} from 'express';

import { RequestContextMiddleware } from '../../src/common/middleware/request-context.middleware';
import type { RequestContextRequest } from '../../src/common/types/request-context.type';

function createResponse(): {
  response: Response;
  setHeader: jest.Mock;
} {
  const setHeader = jest.fn();

  return {
    response: {
      setHeader,
    } as unknown as Response,
    setHeader,
  };
}

describe('RequestContextMiddleware', () => {
  it('generates a server request ID and preserves a safe correlation ID', () => {
    const middleware =
      new RequestContextMiddleware();

    const request = {
      headers: {
        'x-request-id':
          'attacker-controlled',
        'x-correlation-id':
          'checkout-flow:123',
      },
    } as unknown as RequestContextRequest;

    const { response, setHeader } =
      createResponse();

    middleware.use(
      request,
      response,
      jest.fn() as NextFunction,
    );

    expect(request.requestId).toMatch(
      /^[0-9a-f-]{36}$/,
    );

    expect(request.requestId).not.toBe(
      'attacker-controlled',
    );

    expect(request.correlationId).toBe(
      'checkout-flow:123',
    );

    expect(setHeader).toHaveBeenCalledWith(
      'X-Request-ID',
      request.requestId,
    );
  });

  it('falls back to the server request ID when correlation is missing', () => {
    const middleware =
      new RequestContextMiddleware();

    const request = {
      headers: {},
    } as unknown as RequestContextRequest;

    const { response } =
      createResponse();

    middleware.use(
      request,
      response,
      jest.fn(),
    );

    expect(request.correlationId).toBe(
      request.requestId,
    );
  });

  it('rejects malformed or oversized correlation IDs', () => {
    const middleware =
      new RequestContextMiddleware();

    for (const value of [
      'unsafe value',
      'x'.repeat(129),
      'line\nbreak',
    ]) {
      const request = {
        headers: {
          'x-correlation-id': value,
        },
      } as unknown as RequestContextRequest;

      const { response } =
        createResponse();

      middleware.use(
        request,
        response,
        jest.fn(),
      );

      expect(request.correlationId).toBe(
        request.requestId,
      );
    }
  });
});
