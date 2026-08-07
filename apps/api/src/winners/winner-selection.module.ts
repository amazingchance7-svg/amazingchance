import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { PublicWinnerSelectionVerificationService } from './public-winner-selection-verification.service';
import { WinnerSelectionService } from './winner-selection.service';

@Module({
  imports: [
    PrismaModule,
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
