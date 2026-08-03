import { DrawStatus, DrawType, PaymentStatus, PurchaseStatus, UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { LedgerService } from '../../src/ledger/ledger.service';
import { PaymentOrchestratorService } from '../../src/payments/payment-orchestrator.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TicketAllocationService } from '../../src/tickets/ticket-allocation.service';
import { cleanTestDatabase, createTestPrisma } from './database.helper';

describe('Verified payment orchestration integration',()=>{
  let prisma:PrismaService;let service:PaymentOrchestratorService;
  beforeAll(async()=>{prisma=await createTestPrisma();service=new PaymentOrchestratorService(prisma,new LedgerService(prisma),new TicketAllocationService())});
  beforeEach(async()=>cleanTestDatabase(prisma));
  afterAll(async()=>prisma.$disconnect());

  async function scenario(ticketCount=3){
    const user=await prisma.user.create({data:{email:`${randomUUID()}@example.com`,passwordHash:'hash',status:UserStatus.ACTIVE,emailVerifiedAt:new Date()}});
    const draw=await prisma.lotteryDraw.create({data:{publicId:`W-2026-${randomUUID()}`,type:DrawType.WEEKLY,status:DrawStatus.SALES_OPEN,sequenceNumber:Math.floor(Math.random()*1_000_000),scheduledDrawAt:new Date(Date.now()+86400000),currency:'USD',ticketPriceMinor:100n}});
    const purchase=await prisma.purchase.create({data:{publicId:`PUR-${randomUUID()}`,userId:user.id,drawId:draw.id,status:PurchaseStatus.PAYMENT_PENDING,requestedTicketCount:ticketCount,ticketPriceMinor:100n,totalAmountMinor:BigInt(ticketCount)*100n,currency:'USD',idempotencyKey:randomUUID()}});
    const payment=await prisma.payment.create({data:{purchaseId:purchase.id,provider:'TEST',providerTransactionId:randomUUID(),status:PaymentStatus.SUCCEEDED,amountMinor:BigInt(ticketCount)*100n,currency:'USD',confirmedAt:new Date()}});
    return{user,draw,purchase,payment};
  }

  it('commits ledger, purchase, allocation and tickets atomically',async()=>{
    const s=await scenario(3);const result=await service.confirmPayment(s.payment.id);
    expect(result.ticketCount).toBe(3);
    expect((await prisma.purchase.findUniqueOrThrow({where:{id:s.purchase.id}})).status).toBe(PurchaseStatus.COMPLETED);
    expect(await prisma.ledgerTransaction.count()).toBe(1);
    expect(await prisma.ticketAllocation.count()).toBe(1);
    const tickets=await prisma.ticket.findMany({where:{purchaseId:s.purchase.id},orderBy:{numberInDraw:'asc'}});
    expect(tickets.map(t=>t.numberInDraw.toString())).toEqual(['1','2','3']);
  });

  it('is idempotent for a repeated confirmation',async()=>{
    const s=await scenario(2);const first=await service.confirmPayment(s.payment.id);const second=await service.confirmPayment(s.payment.id);
    expect(second.alreadyProcessed).toBe(true);expect(second.ledgerTransactionId).toBe(first.ledgerTransactionId);
    expect(await prisma.ledgerTransaction.count()).toBe(1);expect(await prisma.ticketAllocation.count()).toBe(1);expect(await prisma.ticket.count()).toBe(2);
  });

  it('rolls back ledger and allocation when ticket issuance fails',async()=>{
    const s=await scenario(1);
    await prisma.ticket.create({data:{publicId:`TKT-${randomUUID()}`,userId:s.user.id,purchaseId:s.purchase.id,drawId:s.draw.id,numberInDraw:1n}});
    await expect(service.confirmPayment(s.payment.id)).rejects.toThrow();
    expect((await prisma.purchase.findUniqueOrThrow({where:{id:s.purchase.id}})).status).toBe(PurchaseStatus.PAYMENT_PENDING);
    expect(await prisma.ledgerTransaction.count()).toBe(0);expect(await prisma.ticketAllocation.count()).toBe(0);expect(await prisma.ticket.count()).toBe(1);
  });

  it('rejects a non-succeeded payment without side effects',async()=>{
    const s=await scenario(1);await prisma.payment.update({where:{id:s.payment.id},data:{status:PaymentStatus.PENDING}});
    await expect(service.confirmPayment(s.payment.id)).rejects.toThrow();
    expect(await prisma.ledgerTransaction.count()).toBe(0);expect(await prisma.ticketAllocation.count()).toBe(0);expect(await prisma.ticket.count()).toBe(0);
  });
});
