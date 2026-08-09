import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TicketAllocationService } from './ticket-allocation.service';
import { TicketsQueryService } from './tickets-query.service';
import { TicketsController } from './tickets.controller';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
  ],
  controllers: [
    TicketsController,
  ],
  providers: [
    TicketAllocationService,
    TicketsQueryService,
  ],
  exports: [
    TicketAllocationService,
    TicketsQueryService,
  ],
})
export class TicketsModule {}
