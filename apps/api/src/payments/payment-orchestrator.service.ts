import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditActorType, LedgerAccountCode, LedgerSide, LedgerTransactionType, PaymentStatus, Prisma, PurchaseStatus } from '@prisma/client';
import { createCorrelationId, createPublicId } from '../common/utils/identifier.util';
import { LedgerService } from '../ledger/ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { TicketAllocationService } from '../tickets/ticket-allocation.service';

export type ConfirmPaymentResult={purchaseId:string;paymentId:string;ledgerTransactionId:string;ticketCount:number;alreadyProcessed:boolean};

@Injectable()
export class PaymentOrchestratorService{
  constructor(private readonly prisma:PrismaService,private readonly ledger:LedgerService,private readonly allocation:TicketAllocationService){}
  async confirmPayment(paymentId:string):Promise<ConfirmPaymentResult>{
    return this.prisma.$transaction(async tx=>{
      const payment=await tx.payment.findUnique({where:{id:paymentId},include:{purchase:{include:{tickets:{select:{id:true}}}}}});
      if(!payment)throw new NotFoundException('Payment not found');
      const purchase=payment.purchase;
      const key=`payment-confirmed:${payment.id}`;
      if(purchase.status===PurchaseStatus.COMPLETED){
        const existing=await tx.ledgerTransaction.findUnique({where:{idempotencyKey:key}});
        if(!existing)throw new ConflictException('Completed purchase is missing its ledger transaction');
        return{purchaseId:purchase.id,paymentId:payment.id,ledgerTransactionId:existing.id,ticketCount:purchase.tickets.length,alreadyProcessed:true};
      }
      if(payment.status!==PaymentStatus.SUCCEEDED)throw new ConflictException('Only a succeeded payment can be confirmed');
      if(payment.amountMinor!==purchase.totalAmountMinor||payment.currency!==purchase.currency)throw new ConflictException('Payment amount or currency does not match the purchase');
      if((purchase.status === PurchaseStatus.CANCELLED || purchase.status === PurchaseStatus.EXPIRED || purchase.status === PurchaseStatus.REFUNDED))throw new ConflictException(`Purchase in ${purchase.status} cannot be completed`);
      const correlationId=createCorrelationId();
      const ledgerResult=await this.ledger.appendInTransaction(tx,{type:LedgerTransactionType.PAYMENT_CONFIRMED,idempotencyKey:key,referenceType:'PAYMENT',referenceId:payment.id,currency:payment.currency,description:'Payment confirmed for ticket purchase',metadata:{purchaseId:purchase.id,drawId:purchase.drawId},postings:[
        {accountCode:LedgerAccountCode.CASH,side:LedgerSide.DEBIT,amountMinor:payment.amountMinor},
        {accountCode:LedgerAccountCode.PAYMENT_CLEARING,side:LedgerSide.CREDIT,amountMinor:payment.amountMinor},
      ]});
      const reserved=await this.allocation.reserveRange(tx,{purchaseId:purchase.id,drawId:purchase.drawId,ticketCount:purchase.requestedTicketCount,correlationId});
      if(!reserved.alreadyAllocated){
        const rows=[] as {publicId:string;userId:string;purchaseId:string;drawId:string;numberInDraw:bigint}[];
        for(let n=reserved.allocation.startNumber;n<=reserved.allocation.endNumber;n+=1n)rows.push({publicId:createPublicId('TKT'),userId:purchase.userId,purchaseId:purchase.id,drawId:purchase.drawId,numberInDraw:n});
        await tx.ticket.createMany({data:rows});
      }
      const completedAt=new Date();
      const updated=await tx.purchase.updateMany({where:{id:purchase.id,status:{notIn:[PurchaseStatus.COMPLETED,PurchaseStatus.CANCELLED,PurchaseStatus.EXPIRED,PurchaseStatus.REFUNDED]}},data:{status:PurchaseStatus.COMPLETED,paymentConfirmedAt:purchase.paymentConfirmedAt??payment.confirmedAt??completedAt,completedAt}});
      if(updated.count!==1)throw new ConflictException('Purchase state changed while payment confirmation was processing');
      await tx.purchaseStateEvent.create({data:{purchaseId:purchase.id,fromStatus:purchase.status,toStatus:PurchaseStatus.COMPLETED,cause:'PAYMENT_CONFIRMED_AND_TICKETS_ISSUED',source:AuditActorType.PAYMENT_PROVIDER,correlationId,sealedAt:completedAt,metadata:{paymentId:payment.id,ledgerTransactionId:ledgerResult.transaction.id,ticketAllocationId:reserved.allocation.id,ticketCount:purchase.requestedTicketCount}}});
      const ticketCount=await tx.ticket.count({where:{purchaseId:purchase.id}});
      if(ticketCount!==purchase.requestedTicketCount)throw new ConflictException('Issued ticket count does not match the purchase');
      return{purchaseId:purchase.id,paymentId:payment.id,ledgerTransactionId:ledgerResult.transaction.id,ticketCount,alreadyProcessed:ledgerResult.alreadyAppended&&reserved.alreadyAllocated};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }
}