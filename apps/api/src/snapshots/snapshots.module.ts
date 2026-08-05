import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { PublicAuditService } from './public-audit.service';
import { PublicProofService } from './public-proof.service';
import { PublicSnapshotService } from './public-snapshot.service';
import { PublicVerificationService } from './public-verification.service';
import { SnapshotBuilderService } from './snapshot-builder.service';
import { SnapshotCryptographyService } from './snapshot-cryptography.service';
import { SnapshotFinalizerService } from './snapshot-finalizer.service';

@Module({
  imports: [PrismaModule],
  providers: [
    PublicAuditService,
    PublicProofService,
    PublicSnapshotService,
    PublicVerificationService,
    SnapshotBuilderService,
    SnapshotCryptographyService,
    SnapshotFinalizerService,
  ],
  exports: [
    PublicAuditService,
    PublicProofService,
    PublicSnapshotService,
    PublicVerificationService,
    SnapshotBuilderService,
    SnapshotCryptographyService,
    SnapshotFinalizerService,
  ],
})
export class SnapshotsModule {}