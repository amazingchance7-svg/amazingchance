import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { SnapshotBuilderService } from './snapshot-builder.service';
import { SnapshotCryptographyService } from './snapshot-cryptography.service';
import { SnapshotFinalizerService } from './snapshot-finalizer.service';

@Module({
  imports: [PrismaModule],
  providers: [
    SnapshotBuilderService,
    SnapshotCryptographyService,
    SnapshotFinalizerService,
  ],
  exports: [
    SnapshotBuilderService,
    SnapshotCryptographyService,
    SnapshotFinalizerService,
  ],
})
export class SnapshotsModule {}