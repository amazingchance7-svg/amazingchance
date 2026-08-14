import type {
  PayoutExecutionInstruction,
  PayoutReconciliationInstruction,
} from './payout-orchestrator.service';

export enum PayoutGatewayOutcome {
  SUCCEEDED = 'SUCCEEDED',
  PENDING = 'PENDING',
  FAILED = 'FAILED',
  AMBIGUOUS = 'AMBIGUOUS',
}

export type PayoutGatewayResult =
  | {
      outcome:
        PayoutGatewayOutcome.SUCCEEDED;
      providerTransactionId:
        string;
    }
  | {
      outcome:
        PayoutGatewayOutcome.PENDING;
      providerTransactionId:
        string;
    }
  | {
      outcome:
        PayoutGatewayOutcome.FAILED;
      providerTransactionId?:
        string;
      failureCode:
        string;
      failureMessage:
        string;
    }
  | {
      outcome:
        PayoutGatewayOutcome.AMBIGUOUS;
      providerTransactionId?:
        string;
      failureCode:
        string;
      failureMessage:
        string;
    };

export interface PayoutGateway {
  readonly provider:
    string;

  execute(
    instruction:
      PayoutExecutionInstruction,
  ): Promise<PayoutGatewayResult>;

  reconcile(
    instruction:
      PayoutReconciliationInstruction,
  ): Promise<PayoutGatewayResult>;
}

export const PAYOUT_GATEWAYS =
  Symbol('PAYOUT_GATEWAYS');
