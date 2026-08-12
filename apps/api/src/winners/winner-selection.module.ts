import { Module } from '@nestjs/common';

import { LedgerModule } from '../ledger/ledger.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrizesModule } from '../prizes/prizes.module';
import { PublicWinnerSelectionVerificationService } from './public-winner-selection-verification.service';
import { WinnerSelectionService } from './winner-selection.service';

@Module({
  imports: [
    PrismaModule,
    LedgerModule,
    PrizesModule,
  ],
  providers: [
    WinnerSelectionService,
    PublicWinnerSelectionVerificationService,
  ],
  exports: [
    WinnerSelectionService,
    PublicWinnerSelectionVerificationService,
  ],
})
export class WinnerSelectionModule {}
