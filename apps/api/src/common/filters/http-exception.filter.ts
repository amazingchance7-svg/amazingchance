import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type {
  Request,
  Response,
} from 'express';

import type { ApiErrorResponse } from '../types/api-response.type';

interface NestErrorPayload {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

interface ExtractedPayload {
  message: string | string[];
  error?: string;
}

@Catch()
export class HttpExceptionFilter
  implements ExceptionFilter
{
  private readonly logger = new Logger(
    HttpExceptionFilter.name,
  );

  catch(
    exception: unknown,
    host: ArgumentsHost,
  ): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const payload = this.extractPayload(
      exception,
      statusCode,
    );

    if (
      statusCode >=
      HttpStatus.INTERNAL_SERVER_ERROR
    ) {
      const stack =
        exception instanceof Error
          ? exception.stack
          : undefined;

      this.logger.error(
        `${request.method} ${request.originalUrl} failed`,
        stack,
      );
    }

    const body: ApiErrorResponse = {
      success: false,
      statusCode,
      message: payload.message,
      ...(payload.error
        ? { error: payload.error }
        : {}),
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    };

    response.status(statusCode).json(body);
  }

  private extractPayload(
    exception: unknown,
    statusCode: number,
  ): ExtractedPayload {
    if (
      statusCode ===
      HttpStatus.TOO_MANY_REQUESTS
    ) {
      return {
        message:
          'Too many requests. Please try again later.',
        error: 'Too Many Requests',
      };
    }

    if (!(exception instanceof HttpException)) {
      return {
        message: 'Internal server error',
        error: 'Internal Server Error',
      };
    }

    const response = exception.getResponse();

    if (typeof response === 'string') {
      return {
        message: response,
      };
    }

    const payload =
      response as NestErrorPayload;

    return {
      message:
        payload.message ??
        this.defaultMessageForStatus(
          statusCode,
        ),
      ...(payload.error
        ? { error: payload.error }
        : {}),
    };
  }

  private defaultMessageForStatus(
    statusCode: number,
  ): string {
    if (
      statusCode === HttpStatus.UNAUTHORIZED
    ) {
      return 'Unauthorized';
    }

    if (statusCode === HttpStatus.FORBIDDEN) {
      return 'Forbidden';
    }

    if (statusCode === HttpStatus.NOT_FOUND) {
      return 'Not found';
    }

    return 'Request failed';
  }
}
