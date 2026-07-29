import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly configService: ConfigService,
  ) {}

  async sendEmailVerification(
    email: string,
    token: string,
  ): Promise<void> {
    const webUrl =
      this.configService.get<string>('WEB_URL') ??
      'http://localhost:3000';

    const verificationUrl = new URL(
      '/verify-email',
      webUrl,
    );
    verificationUrl.searchParams.set('token', token);

    // Development transport. Replace with a real email provider
    // without changing AuthService or UserTokenService.
    this.logger.log(
      [
        `Email verification requested for ${email}`,
        `Verification URL: ${verificationUrl.toString()}`,
      ].join('\n'),
    );
  }

  async sendPasswordReset(
    email: string,
    token: string,
  ): Promise<void> {
    const webUrl =
      this.configService.get<string>('WEB_URL') ??
      'http://localhost:3000';

    const resetUrl = new URL(
      '/reset-password',
      webUrl,
    );
    resetUrl.searchParams.set('token', token);

    this.logger.log(
      [
        `Password reset requested for ${email}`,
        `Password reset URL: ${resetUrl.toString()}`,
      ].join('\n'),
    );
  }
}
