import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ComplianceModule } from '../compliance/compliance.module';

import { FinanceModule } from '../finance/finance.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TicketsModule } from '../tickets/tickets.module';
import { PaymentOrchestratorService } from './payment-orchestrator.service';
import { StripeClient } from './stripe.client';
import { StripePaymentIntentService } from './stripe-payment-intent.service';
import { StripeRefundService } from './stripe-refund.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeWebhookService } from './stripe-webhook.service';

@Module({
  imports: [
    ConfigModule,
    ComplianceModule,
    PrismaModule,
    LedgerModule,
    TicketsModule,
    FinanceModule,
  ],
  controllers: [
    StripeWebhookController,
  ],
  providers: [
    PaymentOrchestratorService,
    StripeClient,
    StripePaymentIntentService,
    StripeRefundService,
    StripeWebhookService,
  ],
  exports: [
    PaymentOrchestratorService,
    StripePaymentIntentService,
    StripeRefundService,
  ],
})
export class PaymentsModule {}
