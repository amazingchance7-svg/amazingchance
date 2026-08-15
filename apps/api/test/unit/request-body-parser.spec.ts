import {
  Controller,
  Module,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type {
  NestExpressApplication,
} from '@nestjs/platform-express';
import type {
  Request,
} from 'express';
import {
  request as httpRequest,
} from 'node:http';

import {
  API_REQUEST_BODY_LIMIT,
} from '../../src/common/constants/request-body.constants';

@Controller('body-parser-probe')
class BodyParserProbeController {
  @Post()
  handle(
    @Req()
    request:
      RawBodyRequest<Request>,
  ) {
    return {
      rawBody:
        request.rawBody?.toString(
          'utf8',
        ),
      body:
        request.body,
    };
  }
}

@Module({
  controllers: [
    BodyParserProbeController,
  ],
})
class BodyParserProbeModule {}

function postJson(
  port: number,
  body: string,
): Promise<{
  statusCode: number;
  body: string;
}> {
  return new Promise(
    (
      resolve,
      reject,
    ) => {
      const request =
        httpRequest(
          {
            hostname:
              '127.0.0.1',
            port,
            path:
              '/body-parser-probe',
            method:
              'POST',
            headers: {
              'content-type':
                'application/json',
              'content-length':
                Buffer.byteLength(
                  body,
                ),
            },
          },
          (
            response,
          ) => {
            const chunks:
              Buffer[] = [];

            response.on(
              'data',
              (
                chunk:
                  Buffer,
              ) => {
                chunks.push(
                  chunk,
                );
              },
            );

            response.on(
              'end',
              () => {
                resolve({
                  statusCode:
                    response.statusCode ??
                    0,
                  body:
                    Buffer.concat(
                      chunks,
                    ).toString(
                      'utf8',
                    ),
                });
              },
            );
          },
        );

      request.on(
        'error',
        reject,
      );

      request.end(
        body,
      );
    },
  );
}

describe(
  'Request body parser security contract',
  () => {
    let app:
      NestExpressApplication;
    let port:
      number;

    beforeAll(
      async () => {
        app =
          await NestFactory.create<NestExpressApplication>(
            BodyParserProbeModule,
            {
              rawBody:
                true,
              logger:
                false,
            },
          );

        app.useBodyParser(
          'json',
          {
            limit:
              API_REQUEST_BODY_LIMIT,
          },
        );

        await app.listen(
          0,
          '127.0.0.1',
        );

        const address =
          app
            .getHttpServer()
            .address();

        if (
          !address ||
          typeof address ===
            'string'
        ) {
          throw new Error(
            'HTTP test server address is unavailable',
          );
        }

        port =
          address.port;
      },
    );

    afterAll(
      async () => {
        await app.close();
      },
    );

    it(
      'preserves the exact raw JSON body below the limit',
      async () => {
        const rawBody =
          JSON.stringify({
            value:
              'stripe-webhook-probe',
          });

        const response =
          await postJson(
            port,
            rawBody,
          );

        expect(
          response.statusCode,
        ).toBe(
          201,
        );

        const payload =
          JSON.parse(
            response.body,
          );

        expect(
          payload.rawBody,
        ).toBe(
          rawBody,
        );

        expect(
          payload.body,
        ).toEqual({
          value:
            'stripe-webhook-probe',
        });
      },
    );

    it(
      'rejects JSON payloads above 100kb with 413',
      async () => {
        const rawBody =
          JSON.stringify({
            value:
              'x'.repeat(
                101 * 1024,
              ),
          });

        const response =
          await postJson(
            port,
            rawBody,
          );

        expect(
          response.statusCode,
        ).toBe(
          413,
        );
      },
    );
  },
);
