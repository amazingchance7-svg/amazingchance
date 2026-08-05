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
  it('preserves supplied request and correlation IDs', () => {
    const middleware =
      new RequestContextMiddleware();

    const request = {
      headers: {
        'x-request-id':
          'request-123',
        'x-correlation-id':
          'correlation-456',
      },
    } as unknown as RequestContextRequest;

    const { response, setHeader } =
      createResponse();

    const next =
      jest.fn() as NextFunction;

    middleware.use(
      request,
      response,
      next,
    );

    expect(
      request.requestId,
    ).toBe('request-123');

    expect(
      request.correlationId,
    ).toBe('correlation-456');

    expect(setHeader).toHaveBeenCalledWith(
      'X-Request-ID',
      'request-123',
    );

    expect(setHeader).toHaveBeenCalledWith(
      'X-Correlation-ID',
      'correlation-456',
    );

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates identifiers when headers are missing', () => {
    const middleware =
      new RequestContextMiddleware();

    const request = {
      headers: {},
    } as unknown as RequestContextRequest;

    const { response } =
      createResponse();

    const next =
      jest.fn() as NextFunction;

    middleware.use(
      request,
      response,
      next,
    );

    expect(request.requestId).toMatch(
      /^[0-9a-f-]{36}$/,
    );

    expect(
      request.correlationId,
    ).toBe(request.requestId);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('limits untrusted header length', () => {
    const middleware =
      new RequestContextMiddleware();

    const request = {
      headers: {
        'x-request-id':
          'x'.repeat(500),
      },
    } as unknown as RequestContextRequest;

    const { response } =
      createResponse();

    middleware.use(
      request,
      response,
      jest.fn(),
    );

    expect(
      request.requestId,
    ).toHaveLength(128);
  });
});
