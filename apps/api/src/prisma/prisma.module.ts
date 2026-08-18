import {
  Global,
  Module,
} from '@nestjs/common';

import {
  ClaimPrismaService,
  DrawPrismaService,
  PaymentPrismaService,
  PayoutPrismaService,
  PrismaService,
} from './prisma.service';

@Global()
@Module({
  providers: [
    PrismaService,
    PaymentPrismaService,
    DrawPrismaService,
    ClaimPrismaService,
    PayoutPrismaService,
  ],
  exports: [
    PrismaService,
    PaymentPrismaService,
    DrawPrismaService,
    ClaimPrismaService,
    PayoutPrismaService,
  ],
})
export class PrismaModule {}