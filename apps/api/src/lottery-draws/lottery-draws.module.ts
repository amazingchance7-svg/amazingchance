import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../authorization/authorization.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminLotteryDrawsController } from './admin-lottery-draws.controller';
import { LotteryDrawsController } from './lottery-draws.controller';
import { LotteryDrawsService } from './lottery-draws.service';

@Module({
  imports: [PrismaModule, AuthModule, AuthorizationModule],
  controllers: [LotteryDrawsController, AdminLotteryDrawsController],
  providers: [LotteryDrawsService],
  exports: [LotteryDrawsService],
})
export class LotteryDrawsModule {}
