import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ConfigService,
} from '@nestjs/config';
import {
  createHash,
} from 'node:crypto';

interface ResendResponse {
  id?: string;
}

type EmailKind =
  | 'verification'
  | 'password-reset'
  | 'purchase-completed'
  | 'draw-winner'
  | 'draw-published';

@Injectable()
export class EmailService {
  private readonly logger =
    new Logger(
      EmailService.name,
    );

  constructor(
    private readonly configService:
      ConfigService,
  ) {}

  async sendEmailVerification(
    email: string,
    token: string,
  ): Promise<void> {
    const verificationUrl =
      this.buildActionUrl(
        '/verify-email',
        token,
      );

    await this.deliver({
      kind:
        'verification',
      email,
      token,
      subject:
        'Verify your Amazing Chance email',
      text:
        `Verify your Amazing Chance email: ${verificationUrl}`,
      html:
        `<p>Verify your Amazing Chance email:</p><p><a href="${verificationUrl}">Verify email</a></p>`,
    });
  }

  async sendPasswordReset(
    email: string,
    token: string,
  ): Promise<void> {
    const resetUrl =
      this.buildActionUrl(
        '/reset-password',
        token,
      );

    await this.deliver({
      kind:
        'password-reset',
      email,
      token,
      subject:
        'Reset your Amazing Chance password',
      text:
        `Reset your Amazing Chance password: ${resetUrl}`,
      html:
        `<p>Reset your Amazing Chance password:</p><p><a href="${resetUrl}">Reset password</a></p>`,
    });
  }

  async sendPurchaseConfirmation(
    email: string,
    details: {
      purchasePublicId: string;
      drawPublicId: string;
      ticketNumbers: string[];
    },
  ): Promise<void> {
    const ticketList =
      details.ticketNumbers
        .join(', ');

    await this.deliver({
      kind:
        'purchase-completed',
      email,
      token:
        details.purchasePublicId,
      subject:
        'Your Amazing Chance tickets are ready',
      text:
        [
          `Purchase: ${details.purchasePublicId}`,
          `Draw: ${details.drawPublicId}`,
          `Tickets: ${ticketList}`,
        ].join('\n'),
      html:
        [
          `<p>Purchase: <strong>${details.purchasePublicId}</strong></p>`,
          `<p>Draw: <strong>${details.drawPublicId}</strong></p>`,
          `<p>Tickets: <strong>${ticketList}</strong></p>`,
        ].join(''),
    });
  }
  async sendWinnerNotification(
    email: string,
    details: {
      drawPublicId: string;
      rank: number;
      ticketPublicId: string;
    },
  ): Promise<void> {
    await this.deliver({
      kind:
        'draw-winner',
      email,
      token:
        `${details.drawPublicId}:${details.rank}:${details.ticketPublicId}`,
      subject:
        'You won in Amazing Chance',
      text:
        [
          `Draw: ${details.drawPublicId}`,
          `Winning place: ${details.rank}`,
          `Winning ticket: ${details.ticketPublicId}`,
        ].join('\n'),
      html:
        [
          `<p>Draw: <strong>${details.drawPublicId}</strong></p>`,
          `<p>Winning place: <strong>${details.rank}</strong></p>`,
          `<p>Winning ticket: <strong>${details.ticketPublicId}</strong></p>`,
        ].join(''),
    });
  }

  async sendDrawPublishedNotification(
    email: string,
    details: {
      drawPublicId: string;
    },
  ): Promise<void> {
    await this.deliver({
      kind:
        'draw-published',
      email,
      token:
        details.drawPublicId,
      subject:
        'Amazing Chance draw results are published',
      text:
        `Results for draw ${details.drawPublicId} are now published.`,
      html:
        `<p>Results for draw <strong>${details.drawPublicId}</strong> are now published.</p>`,
    });
  }
  private async deliver(
    message: {
      kind: EmailKind;
      email: string;
      token: string;
      subject: string;
      text: string;
      html: string;
    },
  ): Promise<void> {
    const nodeEnvironment =
      this.configService
        .get<string>(
          'NODE_ENV',
        ) ??
      'development';

    if (
      nodeEnvironment !==
      'production'
    ) {
      this.logger.log(
        [
          `${message.kind} email delivery requested.`,
          'Development/test transport does not send external email.',
          'Sensitive recipient and token are intentionally excluded from application logs.',
        ].join(' '),
      );

      return;
    }

    const provider =
      this.configService
        .get<string>(
          'EMAIL_PROVIDER',
        );

    if (
      provider !== 'resend'
    ) {
      throw new ServiceUnavailableException(
        'Email delivery is not configured',
      );
    }

    const apiKey =
      this.requireConfig(
        'RESEND_API_KEY',
      );

    const from =
      this.requireConfig(
        'EMAIL_FROM',
      );

    const response =
      await fetch(
        'https://api.resend.com/emails',
        {
          method:
            'POST',
          headers: {
            Authorization:
              `Bearer ${apiKey}`,
            'Content-Type':
              'application/json',
            'User-Agent':
              'amazing-chance-api/1.0',
            'Idempotency-Key':
              this.createIdempotencyKey(
                message.kind,
                message.email,
                message.token,
              ),
          },
          body:
            JSON.stringify({
              from:
                `Amazing Chance <${from}>`,
              to: [
                message.email,
              ],
              subject:
                message.subject,
              text:
                message.text,
              html:
                message.html,
            }),
        },
      );

    if (!response.ok) {
      this.logger.error(
        [
          'Email provider delivery failed.',
          `Provider: ${provider}.`,
          `Status: ${response.status}.`,
          'Sensitive recipient, token, provider response, and API key are intentionally excluded from application logs.',
        ].join(' '),
      );

      throw new ServiceUnavailableException(
        'Email delivery is temporarily unavailable',
      );
    }

    const result =
      await response.json()
        .catch(
          () =>
            ({}) as ResendResponse,
        ) as ResendResponse;

    if (!result.id) {
      this.logger.error(
        [
          'Email provider returned an invalid success response.',
          `Provider: ${provider}.`,
          'Sensitive recipient, token, provider response, and API key are intentionally excluded from application logs.',
        ].join(' '),
      );

      throw new ServiceUnavailableException(
        'Email delivery is temporarily unavailable',
      );
    }

    this.logger.log(
      [
        `${message.kind} email accepted by provider.`,
        `Provider: ${provider}.`,
        'Sensitive recipient, token, and API key are intentionally excluded from application logs.',
      ].join(' '),
    );
  }

  private buildActionUrl(
    pathname: string,
    token: string,
  ): string {
    const webUrl =
      this.requireConfig(
        'WEB_URL',
      );

    const url =
      new URL(
        pathname,
        webUrl,
      );

    url.searchParams.set(
      'token',
      token,
    );

    return url.toString();
  }

  private requireConfig(
    key: string,
  ): string {
    const value =
      this.configService
        .get<string>(
          key,
        );

    if (
      !value ||
      value.trim()
        .length === 0
    ) {
      throw new ServiceUnavailableException(
        'Email delivery is not configured',
      );
    }

    return value;
  }

  private createIdempotencyKey(
    kind: EmailKind,
    email: string,
    token: string,
  ): string {
    return [
      'amazing-chance',
      kind,
      createHash(
        'sha256',
      )
        .update(
          `${email}\n${token}`,
          'utf8',
        )
        .digest(
          'hex',
        ),
    ].join(':');
  }
}
