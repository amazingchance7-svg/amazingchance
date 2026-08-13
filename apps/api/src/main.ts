import {
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';
import type {
  NextFunction,
  Request,
  Response,
} from 'express';
import helmet from 'helmet';

import { AppModule } from './app.module';
import {
  API_DEFAULT_PORT,
  API_DEFAULT_WEB_ORIGIN,
} from './common/constants/api.constants';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import {
  createHelmetOptions,
  PERMISSIONS_POLICY_HEADER,
} from './config/security-headers.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(
    AppModule,
    {
      rawBody: true,
    },
  );

  const logger = new Logger('Bootstrap');

  app.enableShutdownHooks();

  const isProduction =
    process.env.NODE_ENV === 'production';

  app.use(
    helmet(
      createHelmetOptions(
        isProduction,
      ),
    ),
  );

  app.use(
    (
      _request: Request,
      response: Response,
      next: NextFunction,
    ) => {
      response.setHeader(
        'Permissions-Policy',
        PERMISSIONS_POLICY_HEADER,
      );

      next();
    },
  );

  app.enableCors({
    origin:
      process.env.WEB_URL ??
      API_DEFAULT_WEB_ORIGIN,
    credentials: true,
    methods: [
      'GET',
      'HEAD',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'X-Request-ID',
      'X-Correlation-ID',
    ],
  });

  app.useGlobalFilters(
    new HttpExceptionFilter(),
  );

  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new ResponseEnvelopeInterceptor(),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (!isProduction) {
    const swaggerConfig =
      new DocumentBuilder()
        .setTitle('Amazing Chance API')
        .setDescription(
          'Backend API for Amazing Chance Lottery Platform',
        )
        .setVersion('1.0.0')
        .addBearerAuth()
        .build();

    const swaggerDocument =
      SwaggerModule.createDocument(
        app,
        swaggerConfig,
      );

    SwaggerModule.setup(
      'api/docs',
      app,
      swaggerDocument,
    );
  }

  const port = Number(
    process.env.API_PORT ??
      API_DEFAULT_PORT,
  );

  await app.listen(port);

  logger.log(
    `Amazing Chance API listening on port ${port}`,
  );

  if (!isProduction) {
    logger.log(
      `Swagger documentation: http://localhost:${port}/api/docs`,
    );
  }
}

void bootstrap();
