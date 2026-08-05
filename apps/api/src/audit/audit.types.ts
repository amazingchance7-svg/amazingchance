import {
  AuditActorType,
  Prisma,
} from '@prisma/client';

import type {
  AuditAction,
  AuditEntityType,
} from './audit-events.constants';

export interface RecordAuditEventInput {
  actorType: AuditActorType;
  actorId?: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  correlationId: string;
  requestId?: string | null;
  ipAddress?: string | null;
  previousState?: Prisma.InputJsonValue;
  newState?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
}

export interface AuditEventRecord {
  id: string;
  actorType: AuditActorType;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  correlationId: string;
  requestId: string | null;
  ipAddress: string | null;
  sealedAt: Date | null;
  createdAt: Date;
}
