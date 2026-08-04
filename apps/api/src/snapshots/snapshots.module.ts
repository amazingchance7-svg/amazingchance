import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { SnapshotBuilderService } from './snapshot-builder.service';

@Module({
  imports: [PrismaModule],
  providers: [SnapshotBuilderService],
  exports: [SnapshotBuilderService],
})
export class SnapshotsModule {}