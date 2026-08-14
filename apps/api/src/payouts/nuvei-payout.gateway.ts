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
} from './payout-orchestrator.service';

const NUVEI_PROVIDER =
  'NUVEI';

const DEFAULT_BASE_URL =
  'https://api-sandbox.nuvei.com/payment-api';

const REQUEST_TIMEOUT_MS =
  15_000;

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
