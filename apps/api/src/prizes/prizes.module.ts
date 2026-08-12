import {
  Module,
} from '@nestjs/common';

import {
  PrismaModule,
} from '../prisma/prisma.module';
import {
  PrizeDistributionService,
} from './prize-distribution.service';
import {
  PrizePoolService,
} from './prize-pool.service';

@Module({
  imports: [
    PrismaModule,
  ],
  providers: [
    PrizeDistributionService,
    PrizePoolService,
  ],
  exports: [
    PrizeDistributionService,
    PrizePoolService,
  ],
})
export class PrizesModule {}
