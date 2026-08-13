import {
  Module,
} from '@nestjs/common';

import {
  PrismaModule,
} from '../prisma/prisma.module';
import {
  ProductionDrawSchedulerService,
} from './production-draw-scheduler.service';

@Module({
  imports: [
    PrismaModule,
  ],
  providers: [
    ProductionDrawSchedulerService,
  ],
  exports: [
    ProductionDrawSchedulerService,
  ],
})
export class WorkersModule {}