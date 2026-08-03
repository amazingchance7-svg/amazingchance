import { Module } from '@nestjs/common';
import { TicketAllocationService } from './ticket-allocation.service';
@Module({providers:[TicketAllocationService],exports:[TicketAllocationService]})
export class TicketsModule {}
