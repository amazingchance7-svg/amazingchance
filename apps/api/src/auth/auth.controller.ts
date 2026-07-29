import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request } from 'express';

import { AuthService } from './auth.service';
import { EmailDto } from './dto/email.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { TokenDto } from './dto/token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  @Get('ping')
  @ApiOperation({
    summary: 'Check authentication service availability',
  })
  @ApiOkResponse({
    description: 'Authentication service is available.',
  })
  ping() {
    return this.authService.ping();
  }

  @Post('register')
  @ApiOperation({
    summary: 'Register a new user',
  })
  @ApiCreatedResponse({
    description: 'User registered successfully.',
  })
  @ApiBadRequestResponse({
    description: 'Invalid registration data.',
  })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @ApiOperation({
    summary: 'Log in with email and password',
  })
  @ApiOkResponse({
    description: 'User logged in successfully.',
  })
  @ApiBadRequestResponse({
    description: 'Invalid login data.',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid email or password.',
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh access and refresh tokens',
  })
  @ApiOkResponse({
    description: 'Tokens refreshed successfully.',
  })
  @ApiUnauthorizedResponse({
    description: 'Refresh token is invalid or expired.',
  })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @ApiOperation({
    summary: 'Log out and revoke refresh token',
  })
  @ApiOkResponse({
    description: 'User logged out successfully.',
  })
  @ApiUnauthorizedResponse({
    description: 'Refresh token is invalid or expired.',
  })
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto);
  }

  @Post('verify-email')
  @ApiOperation({
    summary: 'Verify user email address',
  })
  @ApiOkResponse({
    description: 'Email verified successfully.',
  })
  @ApiBadRequestResponse({
    description: 'Verification token is invalid or expired.',
  })
  verifyEmail(@Body() dto: TokenDto) {
    return this.authService.verifyEmail(dto);
  }

  @Post('resend-verification')
  @ApiOperation({
    summary: 'Resend email verification message',
  })
  @ApiOkResponse({
    description: 'Verification message processed successfully.',
  })
  @ApiBadRequestResponse({
    description: 'Invalid email address.',
  })
  resendVerification(@Body() dto: EmailDto) {
    return this.authService.resendVerification(dto);
  }

  @Post('forgot-password')
  @ApiOperation({
    summary: 'Request a password reset message',
  })
  @ApiOkResponse({
    description: 'Password reset request processed successfully.',
  })
  @ApiBadRequestResponse({
    description: 'Invalid email address.',
  })
  forgotPassword(@Body() dto: EmailDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @ApiOperation({
    summary: 'Reset password using a reset token',
  })
  @ApiOkResponse({
    description: 'Password reset successfully.',
  })
  @ApiBadRequestResponse({
    description: 'Reset token or password is invalid.',
  })
  resetPassword(
    @Body() dto: ResetPasswordDto,
  ) {
    return this.authService.resetPassword(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get the authenticated user',
  })
  @ApiOkResponse({
    description: 'Authenticated user returned successfully.',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing, invalid, or expired.',
  })
  me(@Req() req: Request) {
    return req.user;
  }
}