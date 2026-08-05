import {
  createHash,
  randomUUID,
} from 'node:crypto';

import type { RequestContextRequest } from '../common/types/request-context.type';

export interface AuditRequestContext {
  requestId: string | null;
  correlationId: string;
  ipAddress: string | null;
}

export function getAuditRequestContext(
  request: RequestContextRequest,
): AuditRequestContext {
  return {
    requestId:
      request.requestId ?? null,
    correlationId:
      request.correlationId ??
      request.requestId ??
      randomUUID(),
    ipAddress:
      request.ip ?? null,
  };
}

export function createEmailFingerprint(
  email: string,
): string {
  return createHash('sha256')
    .update(
      email.trim().toLowerCase(),
      'utf8',
    )
    .digest('hex');
}
