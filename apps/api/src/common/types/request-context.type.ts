import type { Request } from 'express';

export interface AuthenticatedRequestUser {
  id?: string;
  email?: string;
}

export interface RequestContextRequest
  extends Request {
  requestId?: string;
  correlationId?: string;
  user?: AuthenticatedRequestUser;
}
