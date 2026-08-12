import {
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ConfigService,
} from '@nestjs/config';

import {
  EmailService,
} from '../../src/email/email.service';

describe(
  'EmailService production delivery safety',
  () => {
    const originalFetch =
      global.fetch;

    afterEach(
      () => {
        global.fetch =
          originalFetch;

        jest.restoreAllMocks();
      },
    );

    it(
      'does not call an external provider outside production',
      async () => {
        const fetchMock =
          jest.fn();

        global.fetch =
          fetchMock as typeof fetch;

        const service =
          new EmailService(
            new ConfigService({
              NODE_ENV:
                'test',
              WEB_URL:
                'http://localhost:3000',
            }),
          );

        await service
          .sendEmailVerification(
            'user@example.com',
            'sensitive-token',
          );

        expect(
          fetchMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'sends verification email through Resend without exposing credentials in logs',
      async () => {
        const fetchMock =
          jest.fn()
            .mockResolvedValue(
              new Response(
                JSON.stringify({
                  id:
                    'email-id',
                }),
                {
                  status:
                    200,
                  headers: {
                    'Content-Type':
                      'application/json',
                  },
                },
              ),
            );

        global.fetch =
          fetchMock as typeof fetch;

        const logSpy =
          jest
            .spyOn(
              Logger.prototype,
              'log',
            )
            .mockImplementation(
              () =>
                undefined,
            );

        const apiKey =
          [
            're',
            'production',
            'unit',
            'key',
          ].join('_');

        const service =
          new EmailService(
            new ConfigService({
              NODE_ENV:
                'production',
              WEB_URL:
                'https://amazing-chance.com',
              EMAIL_PROVIDER:
                'resend',
              RESEND_API_KEY:
                apiKey,
              EMAIL_FROM:
                'noreply@amazing-chance.com',
            }),
          );

        await service
          .sendEmailVerification(
            'private-user@example.com',
            'sensitive-verification-token',
          );

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(
          1,
        );

        const [
          url,
          init,
        ] =
          fetchMock.mock
            .calls[0] as [
              string,
              RequestInit,
            ];

        expect(url).toBe(
          'https://api.resend.com/emails',
        );

        expect(
          init.headers,
        ).toMatchObject({
          Authorization:
            `Bearer ${apiKey}`,
          'Content-Type':
            'application/json',
          'User-Agent':
            'amazing-chance-api/1.0',
        });

        expect(
          (
            init.headers as Record<
              string,
              string
            >
          )[
            'Idempotency-Key'
          ],
        ).toMatch(
          /^amazing-chance:verification:[a-f0-9]{64}$/,
        );

        const body =
          JSON.parse(
            String(
              init.body,
            ),
          ) as {
            from: string;
            to: string[];
            subject: string;
            text: string;
            html: string;
          };

        expect(
          body.from,
        ).toBe(
          'Amazing Chance <noreply@amazing-chance.com>',
        );

        expect(
          body.to,
        ).toEqual([
          'private-user@example.com',
        ]);

        expect(
          body.text,
        ).toContain(
          'token=sensitive-verification-token',
        );

        expect(
          body.html,
        ).toContain(
          'token=sensitive-verification-token',
        );

        const logOutput =
          logSpy.mock.calls
            .flat()
            .join(' ');

        expect(
          logOutput,
        ).not.toContain(
          'private-user@example.com',
        );

        expect(
          logOutput,
        ).not.toContain(
          'sensitive-verification-token',
        );

        expect(
          logOutput,
        ).not.toContain(
          apiKey,
        );
      },
    );

    it(
      'fails closed when production provider configuration is missing',
      async () => {
        const service =
          new EmailService(
            new ConfigService({
              NODE_ENV:
                'production',
              WEB_URL:
                'https://amazing-chance.com',
            }),
          );

        await expect(
          service
            .sendPasswordReset(
              'user@example.com',
              'reset-token',
            ),
        ).rejects.toBeInstanceOf(
          ServiceUnavailableException,
        );
      },
    );

    it(
      'fails closed without logging provider response bodies',
      async () => {
        const fetchMock =
          jest.fn()
            .mockResolvedValue(
              new Response(
                'provider-sensitive-error-body',
                {
                  status:
                    500,
                },
              ),
            );

        global.fetch =
          fetchMock as typeof fetch;

        const errorSpy =
          jest
            .spyOn(
              Logger.prototype,
              'error',
            )
            .mockImplementation(
              () =>
                undefined,
            );

        const service =
          new EmailService(
            new ConfigService({
              NODE_ENV:
                'production',
              WEB_URL:
                'https://amazing-chance.com',
              EMAIL_PROVIDER:
                'resend',
              RESEND_API_KEY:
                [
                  're',
                  'production',
                  'unit',
                  'key',
                ].join('_'),
              EMAIL_FROM:
                'noreply@amazing-chance.com',
            }),
          );

        await expect(
          service
            .sendPasswordReset(
              'user@example.com',
              'reset-sensitive-token',
            ),
        ).rejects.toThrow(
          'Email delivery is temporarily unavailable',
        );

        const errorOutput =
          errorSpy.mock.calls
            .flat()
            .join(' ');

        expect(
          errorOutput,
        ).not.toContain(
          'provider-sensitive-error-body',
        );

        expect(
          errorOutput,
        ).not.toContain(
          'reset-sensitive-token',
        );

        expect(
          errorOutput,
        ).not.toContain(
          'user@example.com',
        );
      },
    );
  },
);
