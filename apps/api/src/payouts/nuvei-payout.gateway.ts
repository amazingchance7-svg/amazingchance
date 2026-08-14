import {
  Injectable,
} from '@nestjs/common';
import {
  ConfigService,
} from '@nestjs/config';

import {
  PayoutGatewayOutcome,
  type PayoutGateway,
  type PayoutGatewayResult,
} from './payout-gateway';
import type {
  PayoutExecutionInstruction,
  PayoutReconciliationInstruction,
} from './payout-orchestrator.service';

const NUVEI_PROVIDER =
  'NUVEI';

const DEFAULT_BASE_URL =
  'https://api-sandbox.nuvei.com/payment-api';

const REQUEST_TIMEOUT_MS =
  15_000;

type NuveiTransactionDetailsResponse = {
  transactionDetails?: {
    transactionStatus?: unknown;
    transactionType?: unknown;
    merchantTransactionId?: unknown;
    transactionId?: unknown;
    processedAmount?: unknown;
    processedCurrency?: unknown;
    errorDescription?: unknown;
  };
  result?: {
    status?: unknown;
    errors?: {
      code?: unknown;
      reason?: unknown;
    };
  };
};
type NuveiPayoutResponse = {
  payoutId?: unknown;
  transactionId?: unknown;
  result?: {
    status?: unknown;
    errors?: {
      code?: unknown;
      reason?: unknown;
    };
  };
};

@Injectable()
export class NuveiPayoutGateway
  implements PayoutGateway
{
  readonly provider =
    NUVEI_PROVIDER;

  constructor(
    private readonly config:
      ConfigService,
  ) {}

  async execute(
    instruction:
      PayoutExecutionInstruction,
  ): Promise<PayoutGatewayResult> {
    if (
      instruction.provider
        .trim()
        .toUpperCase() !==
      NUVEI_PROVIDER
    ) {
      return {
        outcome:
          PayoutGatewayOutcome
            .AMBIGUOUS,
        failureCode:
          'NUVEI_PROVIDER_MISMATCH',
        failureMessage:
          'Payout instruction provider does not match Nuvei gateway.',
      };
    }

    const apiKey =
      this.requiredConfig(
        'NUVEI_API_KEY',
      );

    const processingEntityId =
      this.requiredConfig(
        'NUVEI_PROCESSING_ENTITY_ID',
      );

    const baseUrl =
      (
        this.config.get<string>(
          'NUVEI_BASE_URL',
        ) ??
        DEFAULT_BASE_URL
      ).replace(/\/+$/, '');

    const amount =
      this.toMajorAmount(
        instruction.amountMinor,
        instruction.currency,
      );

    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => {
          controller.abort();
        },
        REQUEST_TIMEOUT_MS,
      );

    try {
      const response =
        await fetch(
          `${baseUrl}/payouts`,
          {
            method:
              'POST',
            headers: {
              'content-type':
                'application/json',
              'x-api-key':
                apiKey,
              'idempotency-key':
                instruction.idempotencyKey,
            },
            body:
              JSON.stringify({
                processingEntityId,
                merchantTransactionId:
                  this.merchantTransactionId(
                    instruction.payoutId,
                  ),
                amount,
                currency:
                  instruction.currency,
                paymentOption: {
                  paymentToken: {
                    paymentTokenId:
                      instruction.destinationRef,
                  },
                },
              }),
            signal:
              controller.signal,
          },
        );

      let payload:
        NuveiPayoutResponse;

      try {
        payload =
          (await response.json()) as
            NuveiPayoutResponse;
      } catch {
        return {
          outcome:
            PayoutGatewayOutcome
              .AMBIGUOUS,
          failureCode:
            'NUVEI_INVALID_RESPONSE',
          failureMessage:
            `Nuvei returned HTTP ${response.status} with an unreadable response body.`,
        };
      }

      return this.mapResult(
        response.status,
        payload,
      );
    } catch (error) {
      return {
        outcome:
          PayoutGatewayOutcome
            .AMBIGUOUS,
        failureCode:
          error instanceof Error &&
          error.name === 'AbortError'
            ? 'NUVEI_TIMEOUT'
            : 'NUVEI_TRANSPORT_ERROR',
        failureMessage:
          error instanceof Error
            ? error.message
            : 'Nuvei payout request ended with an unknown transport outcome.',
      };
    } finally {
      clearTimeout(
        timeout,
      );
    }
  }

  async reconcile(
    instruction:
      PayoutReconciliationInstruction,
  ): Promise<PayoutGatewayResult> {
    if (
      instruction.provider
        .trim()
        .toUpperCase() !==
      NUVEI_PROVIDER
    ) {
      return {
        outcome:
          PayoutGatewayOutcome
            .AMBIGUOUS,
        failureCode:
          'NUVEI_PROVIDER_MISMATCH',
        failureMessage:
          'Payout reconciliation provider does not match Nuvei gateway.',
      };
    }

    const apiKey =
      this.requiredConfig(
        'NUVEI_API_KEY',
      );

    const processingEntityId =
      this.requiredConfig(
        'NUVEI_PROCESSING_ENTITY_ID',
      );

    const baseUrl =
      (
        this.config.get<string>(
          'NUVEI_BASE_URL',
        ) ??
        DEFAULT_BASE_URL
      ).replace(/\/+$/, '');

    const merchantTransactionId =
      this.merchantTransactionId(
        instruction.payoutId,
      );

    const lookupId =
      instruction
        .providerTransactionId
        ?.trim() ||
      merchantTransactionId;

    const source =
      instruction
        .providerTransactionId
        ?.trim()
        ? 'Nuvei'
        : 'Merchant';

    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => {
          controller.abort();
        },
        REQUEST_TIMEOUT_MS,
      );

    try {
      const url =
        `${baseUrl}/entities/${encodeURIComponent(
          processingEntityId,
        )}/transactions/${encodeURIComponent(
          lookupId,
        )}?source=${source}`;

      const response =
        await fetch(
          url,
          {
            method:
              'GET',
            headers: {
              'x-api-key':
                apiKey,
            },
            signal:
              controller.signal,
          },
        );

      if (
        response.status ===
        404
      ) {
        return {
          outcome:
            PayoutGatewayOutcome
              .AMBIGUOUS,
          failureCode:
            'NUVEI_TRANSACTION_NOT_FOUND',
          failureMessage:
            'Nuvei transaction was not found during payout reconciliation.',
        };
      }

      let payload:
        NuveiTransactionDetailsResponse;

      try {
        payload =
          (await response.json()) as
            NuveiTransactionDetailsResponse;
      } catch {
        return {
          outcome:
            PayoutGatewayOutcome
              .AMBIGUOUS,
          failureCode:
            'NUVEI_RECONCILIATION_INVALID_RESPONSE',
          failureMessage:
            `Nuvei reconciliation returned HTTP ${response.status} with an unreadable response body.`,
        };
      }

      if (
        response.status >=
        500
      ) {
        return {
          outcome:
            PayoutGatewayOutcome
              .AMBIGUOUS,
          failureCode:
            'NUVEI_RECONCILIATION_PROVIDER_ERROR',
          failureMessage:
            `Nuvei reconciliation returned HTTP ${response.status}.`,
        };
      }

      if (
        response.status <
          200 ||
        response.status >=
          300
      ) {
        return {
          outcome:
            PayoutGatewayOutcome
              .AMBIGUOUS,
          failureCode:
            `NUVEI_RECONCILIATION_HTTP_${response.status}`,
          failureMessage:
            'Nuvei reconciliation request was not successful.',
        };
      }

      return this.mapReconciliationResult(
        instruction,
        merchantTransactionId,
        payload,
      );
    } catch (error) {
      return {
        outcome:
          PayoutGatewayOutcome
            .AMBIGUOUS,
        failureCode:
          error instanceof Error &&
          error.name === 'AbortError'
            ? 'NUVEI_RECONCILIATION_TIMEOUT'
            : 'NUVEI_RECONCILIATION_TRANSPORT_ERROR',
        failureMessage:
          error instanceof Error
            ? error.message
            : 'Nuvei reconciliation ended with an unknown transport outcome.',
      };
    } finally {
      clearTimeout(
        timeout,
      );
    }
  }

  private mapReconciliationResult(
    instruction:
      PayoutReconciliationInstruction,
    expectedMerchantTransactionId:
      string,
    payload:
      NuveiTransactionDetailsResponse,
  ): PayoutGatewayResult {
    const details =
      payload.transactionDetails;

    if (!details) {
      return {
        outcome:
          PayoutGatewayOutcome
            .AMBIGUOUS,
        failureCode:
          'NUVEI_RECONCILIATION_MISSING_DETAILS',
        failureMessage:
          'Nuvei reconciliation response is missing transaction details.',
      };
    }

    const transactionType =
      typeof details.transactionType ===
        'string'
        ? details.transactionType
            .trim()
            .toLowerCase()
        : '';

    const transactionStatus =
      typeof details.transactionStatus ===
        'string'
        ? details.transactionStatus
            .trim()
            .toUpperCase()
        : '';

    const merchantTransactionId =
      typeof details.merchantTransactionId ===
        'string'
        ? details.merchantTransactionId.trim()
        : '';

    const providerTransactionId =
      typeof details.transactionId ===
        'string'
        ? details.transactionId.trim()
        : '';

    const processedCurrency =
      typeof details.processedCurrency ===
        'string'
        ? details.processedCurrency
            .trim()
            .toUpperCase()
        : '';

    const processedAmount =
      typeof details.processedAmount ===
        'string'
        ? details.processedAmount.trim()
        : '';

    if (
      transactionType !==
      'payout'
    ) {
      return {
        outcome:
          PayoutGatewayOutcome
            .AMBIGUOUS,
        providerTransactionId:
          providerTransactionId ||
          undefined,
        failureCode:
          'NUVEI_RECONCILIATION_TYPE_MISMATCH',
        failureMessage:
          'Nuvei reconciliation matched a transaction that is not a payout.',
      };
    }

    if (
      merchantTransactionId !==
      expectedMerchantTransactionId
    ) {
      return {
        outcome:
          PayoutGatewayOutcome
            .AMBIGUOUS,
        providerTransactionId:
          providerTransactionId ||
          undefined,
        failureCode:
          'NUVEI_RECONCILIATION_MERCHANT_ID_MISMATCH',
        failureMessage:
          'Nuvei reconciliation merchant transaction ID does not match the payout.',
      };
    }

    if (
      instruction
        .providerTransactionId &&
      providerTransactionId !==
        instruction
          .providerTransactionId
    ) {
      return {
        outcome:
          PayoutGatewayOutcome
            .AMBIGUOUS,
        providerTransactionId:
          providerTransactionId ||
          undefined,
        failureCode:
          'NUVEI_RECONCILIATION_PROVIDER_ID_MISMATCH',
        failureMessage:
          'Nuvei reconciliation provider transaction ID does not match recorded evidence.',
      };
    }

    if (
      processedCurrency !==
      instruction.currency
        .trim()
        .toUpperCase()
    ) {
      return {
        outcome:
          PayoutGatewayOutcome
            .AMBIGUOUS,
        providerTransactionId:
          providerTransactionId ||
          undefined,
        failureCode:
          'NUVEI_RECONCILIATION_CURRENCY_MISMATCH',
        failureMessage:
          'Nuvei reconciliation currency does not match the payout.',
      };
    }

    const expectedAmount =
      this.toMajorAmount(
        instruction.amountMinor,
        instruction.currency,
      );

    const actualAmount =
      Number(
        processedAmount,
      );

    if (
      !Number.isFinite(
        actualAmount,
      ) ||
      Math.abs(
        actualAmount -
          expectedAmount,
      ) >
        0.000001
    ) {
      return {
        outcome:
          PayoutGatewayOutcome
            .AMBIGUOUS,
        providerTransactionId:
          providerTransactionId ||
          undefined,
        failureCode:
          'NUVEI_RECONCILIATION_AMOUNT_MISMATCH',
        failureMessage:
          'Nuvei reconciliation amount does not match the payout.',
      };
    }

    if (
      transactionStatus ===
      'APPROVED'
    ) {
      if (
        !providerTransactionId
      ) {
        return {
          outcome:
            PayoutGatewayOutcome
              .AMBIGUOUS,
          failureCode:
            'NUVEI_RECONCILIATION_APPROVED_WITHOUT_TRANSACTION_ID',
          failureMessage:
            'Nuvei reconciliation reported an approved payout without a transaction ID.',
        };
      }

      return {
        outcome:
          PayoutGatewayOutcome
            .SUCCEEDED,
        providerTransactionId,
      };
    }

    if (
      transactionStatus ===
      'DECLINED'
    ) {
      return {
        outcome:
          PayoutGatewayOutcome
            .FAILED,
        providerTransactionId:
          providerTransactionId ||
          undefined,
        failureCode:
          'NUVEI_RECONCILIATION_DECLINED',
        failureMessage:
          typeof details.errorDescription ===
            'string' &&
          details.errorDescription.trim()
            ? details.errorDescription.trim()
            : 'Nuvei reconciliation confirmed that the payout was declined.',
      };
    }

    /*
     * Retrieve Transaction Details currently
     * documents APPROVED, DECLINED and ERROR.
     * Any non-definitive/unknown value remains
     * unresolved rather than triggering payout
     * execution.
     */
    return {
      outcome:
        PayoutGatewayOutcome
          .AMBIGUOUS,
      providerTransactionId:
        providerTransactionId ||
        undefined,
      failureCode:
        transactionStatus ===
          'ERROR'
          ? 'NUVEI_RECONCILIATION_ERROR'
          : 'NUVEI_RECONCILIATION_UNKNOWN_STATUS',
      failureMessage:
        typeof details.errorDescription ===
          'string' &&
        details.errorDescription.trim()
          ? details.errorDescription.trim()
          : `Nuvei reconciliation returned transaction status ${transactionStatus || 'unknown'}.`,
    };
  }
  private mapResult(
    httpStatus: number,
    payload:
      NuveiPayoutResponse,
  ): PayoutGatewayResult {
    const status =
      typeof payload.result
        ?.status === 'string'
        ? payload.result.status
            .trim()
            .toLowerCase()
        : '';

    const providerTransactionId =
      typeof payload.transactionId ===
        'string'
        ? payload.transactionId.trim()
        : '';

    const errorCode =
      typeof payload.result?.errors
        ?.code === 'string'
        ? payload.result.errors.code
        : `NUVEI_HTTP_${httpStatus}`;

    const errorReason =
      typeof payload.result?.errors
        ?.reason === 'string'
        ? payload.result.errors.reason
        : `Nuvei returned payout status ${status || 'unknown'}.`;

    if (
      httpStatus >= 500
    ) {
      return {
        outcome:
          PayoutGatewayOutcome
            .AMBIGUOUS,
        providerTransactionId:
          providerTransactionId ||
          undefined,
        failureCode:
          errorCode,
        failureMessage:
          errorReason,
      };
    }

    if (
      status === 'approved'
    ) {
      if (
        !providerTransactionId
      ) {
        return {
          outcome:
            PayoutGatewayOutcome
              .AMBIGUOUS,
          failureCode:
            'NUVEI_APPROVED_WITHOUT_TRANSACTION_ID',
          failureMessage:
            'Nuvei reported an approved payout without a transaction ID.',
        };
      }

      return {
        outcome:
          PayoutGatewayOutcome
            .SUCCEEDED,
        providerTransactionId,
      };
    }

    if (
      status === 'pending'
    ) {
      if (
        !providerTransactionId
      ) {
        return {
          outcome:
            PayoutGatewayOutcome
              .AMBIGUOUS,
          failureCode:
            'NUVEI_PENDING_WITHOUT_TRANSACTION_ID',
          failureMessage:
            'Nuvei reported a pending payout without a transaction ID.',
        };
      }

      return {
        outcome:
          PayoutGatewayOutcome
            .PENDING,
        providerTransactionId,
      };
    }

    if (
      status === 'declined'
    ) {
      return {
        outcome:
          PayoutGatewayOutcome
            .FAILED,
        providerTransactionId:
          providerTransactionId ||
          undefined,
        failureCode:
          errorCode,
        failureMessage:
          errorReason,
      };
    }

    /*
     * Nuvei documents additional result
     * statuses, including "error".
     *
     * We intentionally treat every
     * non-definitive state as ambiguous
     * rather than risking a duplicate
     * payout.
     */
    return {
      outcome:
        PayoutGatewayOutcome
          .AMBIGUOUS,
      providerTransactionId:
        providerTransactionId ||
        undefined,
      failureCode:
        errorCode,
      failureMessage:
        errorReason,
    };
  }

  private requiredConfig(
    name: string,
  ): string {
    const value =
      this.config
        .get<string>(
          name,
        )
        ?.trim();

    if (!value) {
      throw new Error(
        `${name} is required for Nuvei payouts`,
      );
    }

    return value;
  }

  private merchantTransactionId(
    payoutId: string,
  ): string {
    const value =
      `AC-${payoutId}`;

    if (
      value.length <=
      45
    ) {
      return value;
    }

    return value.slice(
      0,
      45,
    );
  }

  private toMajorAmount(
    amountMinor:
      string,
    currency:
      string,
  ): number {
    /*
     * Current Amazing Chance ledger
     * operates in USD minor units.
     *
     * Fail closed instead of silently
     * assuming ISO minor-unit rules for
     * currencies we have not enabled.
     */
    if (
      currency !==
      'USD'
    ) {
      throw new Error(
        `Nuvei payout currency ${currency} is not enabled`,
      );
    }

    const minor =
      BigInt(
        amountMinor,
      );

    if (
      minor <=
      0n
    ) {
      throw new Error(
        'Nuvei payout amount must be positive',
      );
    }

    if (
      minor >
      BigInt(
        Number.MAX_SAFE_INTEGER,
      )
    ) {
      throw new Error(
        'Nuvei payout amount exceeds safe numeric range',
      );
    }

    return (
      Number(minor) /
      100
    );
  }
}
