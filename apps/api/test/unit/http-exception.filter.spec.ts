import {
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type {
  Request,
  Response,
} from 'express';

import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

type ResponseBody = {
  success: boolean;
  statusCode: number;
  message: string | string[];
  error?: string;
  timestamp: string;
  path: string;
};

function createHost(): {
  host: ArgumentsHost;
  status: jest.Mock;
  json: jest.Mock;
} {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({
    json,
  });

  const request = {
    method: 'GET',
    originalUrl: '/auth/ping',
  } as Request;

  const response = {
    status,
  } as unknown as Response;

  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  return {
    host,
    status,
    json,
  };
}

describe('HttpExceptionFilter', () => {
  it('returns a neutral public message for rate limits', () => {
    const filter =
      new HttpExceptionFilter();
    const { host, status, json } =
      createHost();

    const exception = new HttpException(
      'ThrottlerException: Too Many Requests',
      HttpStatus.TOO_MANY_REQUESTS,
    );

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(
      HttpStatus.TOO_MANY_REQUESTS,
    );

    const body = json.mock
      .calls[0][0] as ResponseBody;

    expect(body).toMatchObject({
      success: false,
      statusCode:
        HttpStatus.TOO_MANY_REQUESTS,
      message:
        'Too many requests. Please try again later.',
      error: 'Too Many Requests',
      path: '/auth/ping',
    });

    expect(
      JSON.stringify(body),
    ).not.toContain(
      'ThrottlerException',
    );

    expect(
      Number.isNaN(
        Date.parse(body.timestamp),
      ),
    ).toBe(false);
  });

  it('preserves safe validation messages', () => {
    const filter =
      new HttpExceptionFilter();
    const { host, status, json } =
      createHost();

    const exception = new HttpException(
      {
        statusCode:
          HttpStatus.BAD_REQUEST,
        message: [
          'email must be an email',
        ],
        error: 'Bad Request',
      },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(
      HttpStatus.BAD_REQUEST,
    );

    expect(
      json.mock.calls[0][0],
    ).toMatchObject({
      success: false,
      statusCode:
        HttpStatus.BAD_REQUEST,
      message: [
        'email must be an email',
      ],
      error: 'Bad Request',
      path: '/auth/ping',
    });
  });

  it('hides unexpected internal errors', () => {
    const filter =
      new HttpExceptionFilter();
    const { host, status, json } =
      createHost();

    filter.catch(
      new Error(
        'database password leaked',
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );

    const body = json.mock
      .calls[0][0] as ResponseBody;

    expect(body).toMatchObject({
      success: false,
      statusCode:
        HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
    });

    expect(
      JSON.stringify(body),
    ).not.toContain(
      'database password leaked',
    );
  });
});
