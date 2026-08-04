import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { PublicProofService } from './public-proof.service';
import { PublicSnapshotService } from './public-snapshot.service';
import { SnapshotBuilderService } from './snapshot-builder.service';
import { SnapshotCryptographyService } from './snapshot-cryptography.service';
import { SnapshotFinalizerService } from './snapshot-finalizer.service';

@Module({
  imports: [PrismaModule],
  providers: [
    PublicProofService,
    PublicSnapshotService,
    SnapshotBuilderService,
    SnapshotCryptographyService,
    SnapshotFinalizerService,
  ],
  exports: [
    PublicProofService,
    PublicSnapshotService,
    SnapshotBuilderService,
    SnapshotCryptographyService,
    SnapshotFinalizerService,
  ],
})
export class SnapshotsModule {}