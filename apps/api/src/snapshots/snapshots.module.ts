import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { PublicSnapshotService } from './public-snapshot.service';
import { SnapshotBuilderService } from './snapshot-builder.service';
import { SnapshotCryptographyService } from './snapshot-cryptography.service';
import { SnapshotFinalizerService } from './snapshot-finalizer.service';

@Module({
  imports: [PrismaModule],
  providers: [
    PublicSnapshotService,
    SnapshotBuilderService,
    SnapshotCryptographyService,
    SnapshotFinalizerService,
  ],
  exports: [
    PublicSnapshotService,
    SnapshotBuilderService,
    SnapshotCryptographyService,
    SnapshotFinalizerService,
  ],
})
export class SnapshotsModule {}