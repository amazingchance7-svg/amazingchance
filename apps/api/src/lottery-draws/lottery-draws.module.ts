import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { LotteryDrawsController } from './lottery-draws.controller';
import { LotteryDrawsService } from './lottery-draws.service';

@Module({
  imports: [PrismaModule],
  controllers: [LotteryDrawsController],
  providers: [LotteryDrawsService],
  exports: [LotteryDrawsService],
})
export class LotteryDrawsModule {}