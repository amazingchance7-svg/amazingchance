export type JwtTokenType =
  'access' | 'refresh';

export interface JwtPayload {
  sub: string;
  email: string;
  type: JwtTokenType;
  mfa?: boolean;
  jti?: string;
  iat?: number;
  exp?: number;
}
