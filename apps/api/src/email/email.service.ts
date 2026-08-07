import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger =
    new Logger(EmailService.name);

  constructor(
    private readonly configService:
      ConfigService,
  ) {}

  async sendEmailVerification(
    email: string,
    token: string,
  ): Promise<void> {
    this.discardSensitiveDevelopmentPayload(
      email,
      token,
    );

    this.logger.log(
      [
        'Email verification delivery requested.',
        `Destination: ${this.getSafeDestination('/verify-email')}`,
        'Sensitive verification token is intentionally excluded from application logs.',
      ].join(' '),
    );
  }

  async sendPasswordReset(
    email: string,
    token: string,
  ): Promise<void> {
    this.discardSensitiveDevelopmentPayload(
      email,
      token,
    );

    this.logger.log(
      [
        'Password reset delivery requested.',
        `Destination: ${this.getSafeDestination('/reset-password')}`,
        'Sensitive password-reset token is intentionally excluded from application logs.',
      ].join(' '),
    );
  }

  private getSafeDestination(
    pathname: string,
  ): string {
    const webUrl =
      this.configService.get<string>(
        'WEB_URL',
      ) ??
      'http://localhost:3000';

    return new URL(
      pathname,
      webUrl,
    ).toString();
  }

  private discardSensitiveDevelopmentPayload(
    email: string,
    token: string,
  ): void {
    void email;
    void token;
  }
}
