import { Module } from '@nestjs/common';

import { LotteryDrawsModule } from '../lottery-draws/lottery-draws.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RandomnessModule } from '../randomness/randomness.module';
import { SnapshotsModule } from '../snapshots/snapshots.module';
import { WinnerSelectionModule } from '../winners/winner-selection.module';
import { AutomatedDrawLifecycleService } from './automated-draw-lifecycle.service';
import { ProductionDrawSchedulerService } from './production-draw-scheduler.service';

@Module({
  imports: [
    PrismaModule,
    SnapshotsModule,
    RandomnessModule,
    WinnerSelectionModule,
    LotteryDrawsModule,
  ],
  providers: [
    AutomatedDrawLifecycleService,
    ProductionDrawSchedulerService,
  ],
  exports: [
    AutomatedDrawLifecycleService,
    ProductionDrawSchedulerService,
  ],
})
export class WorkersModule {}