import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { WinnerSelectionService } from './winner-selection.service';

@Module({
  imports: [PrismaModule],
  providers: [WinnerSelectionService],
  exports: [WinnerSelectionService],
})
export class WinnerSelectionModule {}
