export type JwtTokenType =
  'access' | 'refresh';

export interface JwtPayload {
  sub: string;
  email: string;
  type: JwtTokenType;
  mfa?: boolean;
  authVersion?: number;
  jti?: string;
  iat?: number;
  exp?: number;
}
