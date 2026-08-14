import {
  Module,
} from '@nestjs/common';

import {
  LedgerModule,
} from '../ledger/ledger.module';
import {
  PrismaModule,
} from '../prisma/prisma.module';
import {
  NuveiPayoutGateway,
} from './nuvei-payout.gateway';
import {
  PAYOUT_GATEWAYS,
  type PayoutGateway,
} from './payout-gateway';
import {
  PayoutGatewayRegistry,
} from './payout-gateway.registry';
import {
  PayoutOrchestratorService,
} from './payout-orchestrator.service';

@Module({
  imports: [
    PrismaModule,
    LedgerModule,
  ],
  providers: [
    PayoutOrchestratorService,
    NuveiPayoutGateway,
    {
      provide:
        PAYOUT_GATEWAYS,
      useFactory: (
        nuvei:
          NuveiPayoutGateway,
      ): readonly PayoutGateway[] => [
        nuvei,
      ],
      inject: [
        NuveiPayoutGateway,
      ],
    },
    PayoutGatewayRegistry,
  ],
  exports: [
    PayoutOrchestratorService,
    PayoutGatewayRegistry,
  ],
})
export class PayoutsModule {}
