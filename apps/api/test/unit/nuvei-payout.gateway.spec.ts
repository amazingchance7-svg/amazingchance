import {
  ConfigService,
} from '@nestjs/config';

import {
  PayoutGatewayOutcome,
} from '../../src/payouts/payout-gateway';
import {
  NuveiPayoutGateway,
} from '../../src/payouts/nuvei-payout.gateway';

describe(
  'NuveiPayoutGateway',
  () => {
    const originalFetch =
      global.fetch;

    const fetchMock =
      jest.fn();

    const config =
      new ConfigService({
        NUVEI_API_KEY:
          'test-api-key',
        NUVEI_PROCESSING_ENTITY_ID:
          '00000000-0000-4000-8000-000000000001',
        NUVEI_BASE_URL:
          'https://api-sandbox.nuvei.com/payment-api',
      });

    const gateway =
      new NuveiPayoutGateway(
        config,
      );

    const instruction = {
      payoutId:
        '00000000-0000-4000-8000-000000000010',
      prizeId:
        'prize-1',
      userId:
        'user-1',
      amountMinor:
        '175',
      currency:
        'USD',
      provider:
        'NUVEI',
      destinationRef:
        'payment-token-1',
      idempotencyKey:
        'payout:prize-1',
    };

    const reconciliationInstruction = {
      payoutId:
        '00000000-0000-4000-8000-000000000010',
      prizeId:
        'prize-1',
      userId:
        'user-1',
      amountMinor:
        '175',
      currency:
        'USD',
      provider:
        'NUVEI',
      providerTransactionId:
        'nuvei-tx-1',
    };
    beforeAll(() => {
      global.fetch =
        fetchMock as typeof fetch;
    });

    afterAll(() => {
      global.fetch =
        originalFetch;
    });

    beforeEach(() => {
      jest.clearAllMocks();
    });

    function response(
      status:
        number,
      body:
        unknown,
    ) {
      return {
        status,
        json:
          jest.fn()
            .mockResolvedValue(
              body,
            ),
      };
    }

    it(
      'sends idempotent token payout and maps approved result',
      async () => {
        fetchMock
          .mockResolvedValue(
            response(
              201,
              {
                transactionId:
                  'nuvei-tx-1',
                result: {
                  status:
                    'approved',
                },
              },
            ),
          );

        await expect(
          gateway.execute(
            instruction,
          ),
        ).resolves.toEqual({
          outcome:
            PayoutGatewayOutcome
              .SUCCEEDED,
          providerTransactionId:
            'nuvei-tx-1',
        });

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(
          1,
        );

        const [
          url,
          options,
        ] =
          fetchMock.mock
            .calls[0];

        expect(url).toBe(
          'https://api-sandbox.nuvei.com/payment-api/payouts',
        );

        expect(
          options.headers,
        ).toMatchObject({
          'x-api-key':
            'test-api-key',
          'idempotency-key':
            'payout:prize-1',
        });

        expect(
          JSON.parse(
            options.body,
          ),
        ).toMatchObject({
          processingEntityId:
            '00000000-0000-4000-8000-000000000001',
          amount:
            1.75,
          currency:
            'USD',
          paymentOption: {
            paymentToken: {
              paymentTokenId:
                'payment-token-1',
            },
          },
        });
      },
    );

    it(
      'maps pending result',
      async () => {
        fetchMock
          .mockResolvedValue(
            response(
              201,
              {
                transactionId:
                  'nuvei-pending',
                result: {
                  status:
                    'pending',
                },
              },
            ),
          );

        await expect(
          gateway.execute(
            instruction,
          ),
        ).resolves.toEqual({
          outcome:
            PayoutGatewayOutcome
              .PENDING,
          providerTransactionId:
            'nuvei-pending',
        });
      },
    );

    it(
      'maps declined as definitive failure',
      async () => {
        fetchMock
          .mockResolvedValue(
            response(
              201,
              {
                transactionId:
                  'nuvei-declined',
                result: {
                  status:
                    'declined',
                  errors: {
                    code:
                      'DECLINED',
                    reason:
                      'Issuer declined payout',
                  },
                },
              },
            ),
          );

        await expect(
          gateway.execute(
            instruction,
          ),
        ).resolves.toMatchObject({
          outcome:
            PayoutGatewayOutcome
              .FAILED,
          providerTransactionId:
            'nuvei-declined',
          failureCode:
            'DECLINED',
        });
      },
    );

    it(
      'treats Nuvei error result as ambiguous',
      async () => {
        fetchMock
          .mockResolvedValue(
            response(
              201,
              {
                transactionId:
                  'nuvei-error',
                result: {
                  status:
                    'error',
                  errors: {
                    code:
                      '7000.1000',
                    reason:
                      'Internal Processing Error',
                  },
                },
              },
            ),
          );

        await expect(
          gateway.execute(
            instruction,
          ),
        ).resolves.toMatchObject({
          outcome:
            PayoutGatewayOutcome
              .AMBIGUOUS,
          providerTransactionId:
            'nuvei-error',
        });
      },
    );

    it(
      'treats HTTP 5xx as ambiguous even with a response body',
      async () => {
        fetchMock
          .mockResolvedValue(
            response(
              500,
              {
                result: {
                  status:
                    'error',
                },
              },
            ),
          );

        await expect(
          gateway.execute(
            instruction,
          ),
        ).resolves.toMatchObject({
          outcome:
            PayoutGatewayOutcome
              .AMBIGUOUS,
        });
      },
    );

    it(
      'treats transport failure as ambiguous',
      async () => {
        fetchMock
          .mockRejectedValue(
            new Error(
              'socket reset',
            ),
          );

        await expect(
          gateway.execute(
            instruction,
          ),
        ).resolves.toMatchObject({
          outcome:
            PayoutGatewayOutcome
              .AMBIGUOUS,
          failureCode:
            'NUVEI_TRANSPORT_ERROR',
        });

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      'fails closed for unsupported currency',
      async () => {
        await expect(
          gateway.execute({
            ...instruction,
            currency:
              'JPY',
          }),
        ).rejects.toThrow(
          'Nuvei payout currency JPY is not enabled',
        );

        expect(
          fetchMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'treats approved response without transaction ID as ambiguous',
      async () => {
        fetchMock
          .mockResolvedValue(
            response(
              201,
              {
                result: {
                  status:
                    'approved',
                },
              },
            ),
          );

        await expect(
          gateway.execute(
            instruction,
          ),
        ).resolves.toMatchObject({
          outcome:
            PayoutGatewayOutcome
              .AMBIGUOUS,
          failureCode:
            'NUVEI_APPROVED_WITHOUT_TRANSACTION_ID',
        });
      },
    );

    it(
      'reconciles an approved payout using provider transaction ID without creating a payout',
      async () => {
        fetchMock
          .mockResolvedValue(
            response(
              200,
              {
                transactionDetails: {
                  transactionStatus:
                    'APPROVED',
                  transactionType:
                    'payout',
                  merchantTransactionId:
                    'AC-00000000-0000-4000-8000-000000000010',
                  transactionId:
                    'nuvei-tx-1',
                  processedAmount:
                    '1.75',
                  processedCurrency:
                    'USD',
                },
              },
            ),
          );

        await expect(
          gateway.reconcile(
            reconciliationInstruction,
          ),
        ).resolves.toEqual({
          outcome:
            PayoutGatewayOutcome
              .SUCCEEDED,
          providerTransactionId:
            'nuvei-tx-1',
        });

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(
          1,
        );

        const [
          url,
          options,
        ] =
          fetchMock.mock
            .calls[0];

        expect(url).toBe(
          'https://api-sandbox.nuvei.com/payment-api/entities/00000000-0000-4000-8000-000000000001/transactions/nuvei-tx-1?source=Nuvei',
        );

        expect(
          options.method,
        ).toBe(
          'GET',
        );

        expect(
          options.body,
        ).toBeUndefined();
      },
    );

    it(
      'reconciles by merchant transaction ID when provider transaction ID is unknown',
      async () => {
        fetchMock
          .mockResolvedValue(
            response(
              200,
              {
                transactionDetails: {
                  transactionStatus:
                    'APPROVED',
                  transactionType:
                    'payout',
                  merchantTransactionId:
                    'AC-00000000-0000-4000-8000-000000000010',
                  transactionId:
                    'nuvei-recovered',
                  processedAmount:
                    '1.75',
                  processedCurrency:
                    'USD',
                },
              },
            ),
          );

        await expect(
          gateway.reconcile({
            ...reconciliationInstruction,
            providerTransactionId:
              null,
          }),
        ).resolves.toEqual({
          outcome:
            PayoutGatewayOutcome
              .SUCCEEDED,
          providerTransactionId:
            'nuvei-recovered',
        });

        expect(
          fetchMock,
        ).toHaveBeenCalledWith(
          'https://api-sandbox.nuvei.com/payment-api/entities/00000000-0000-4000-8000-000000000001/transactions/AC-00000000-0000-4000-8000-000000000010?source=Merchant',
          expect.objectContaining({
            method:
              'GET',
          }),
        );
      },
    );

    it(
      'maps reconciled declined payout to definitive failure',
      async () => {
        fetchMock
          .mockResolvedValue(
            response(
              200,
              {
                transactionDetails: {
                  transactionStatus:
                    'DECLINED',
                  transactionType:
                    'payout',
                  merchantTransactionId:
                    'AC-00000000-0000-4000-8000-000000000010',
                  transactionId:
                    'nuvei-tx-1',
                  processedAmount:
                    '1.75',
                  processedCurrency:
                    'USD',
                  errorDescription:
                    'Payout declined',
                },
              },
            ),
          );

        await expect(
          gateway.reconcile(
            reconciliationInstruction,
          ),
        ).resolves.toEqual({
          outcome:
            PayoutGatewayOutcome
              .FAILED,
          providerTransactionId:
            'nuvei-tx-1',
          failureCode:
            'NUVEI_RECONCILIATION_DECLINED',
          failureMessage:
            'Payout declined',
        });
      },
    );

    it(
      'keeps Nuvei ERROR reconciliation ambiguous',
      async () => {
        fetchMock
          .mockResolvedValue(
            response(
              200,
              {
                transactionDetails: {
                  transactionStatus:
                    'ERROR',
                  transactionType:
                    'payout',
                  merchantTransactionId:
                    'AC-00000000-0000-4000-8000-000000000010',
                  transactionId:
                    'nuvei-tx-1',
                  processedAmount:
                    '1.75',
                  processedCurrency:
                    'USD',
                  errorDescription:
                    'Provider processing error',
                },
              },
            ),
          );

        await expect(
          gateway.reconcile(
            reconciliationInstruction,
          ),
        ).resolves.toMatchObject({
          outcome:
            PayoutGatewayOutcome
              .AMBIGUOUS,
          providerTransactionId:
            'nuvei-tx-1',
          failureCode:
            'NUVEI_RECONCILIATION_ERROR',
        });
      },
    );

    it(
      'rejects reconciliation transaction identity mismatch',
      async () => {
        fetchMock
          .mockResolvedValue(
            response(
              200,
              {
                transactionDetails: {
                  transactionStatus:
                    'APPROVED',
                  transactionType:
                    'payout',
                  merchantTransactionId:
                    'AC-wrong-payout',
                  transactionId:
                    'nuvei-tx-1',
                  processedAmount:
                    '1.75',
                  processedCurrency:
                    'USD',
                },
              },
            ),
          );

        await expect(
          gateway.reconcile(
            reconciliationInstruction,
          ),
        ).resolves.toMatchObject({
          outcome:
            PayoutGatewayOutcome
              .AMBIGUOUS,
          failureCode:
            'NUVEI_RECONCILIATION_MERCHANT_ID_MISMATCH',
        });
      },
    );

    it(
      'rejects reconciliation amount mismatch',
      async () => {
        fetchMock
          .mockResolvedValue(
            response(
              200,
              {
                transactionDetails: {
                  transactionStatus:
                    'APPROVED',
                  transactionType:
                    'payout',
                  merchantTransactionId:
                    'AC-00000000-0000-4000-8000-000000000010',
                  transactionId:
                    'nuvei-tx-1',
                  processedAmount:
                    '2.75',
                  processedCurrency:
                    'USD',
                },
              },
            ),
          );

        await expect(
          gateway.reconcile(
            reconciliationInstruction,
          ),
        ).resolves.toMatchObject({
          outcome:
            PayoutGatewayOutcome
              .AMBIGUOUS,
          failureCode:
            'NUVEI_RECONCILIATION_AMOUNT_MISMATCH',
        });
      },
    );

    it(
      'keeps missing Nuvei transaction unresolved without executing a payout',
      async () => {
        fetchMock
          .mockResolvedValue(
            response(
              404,
              {},
            ),
          );

        await expect(
          gateway.reconcile({
            ...reconciliationInstruction,
            providerTransactionId:
              null,
          }),
        ).resolves.toMatchObject({
          outcome:
            PayoutGatewayOutcome
              .AMBIGUOUS,
          failureCode:
            'NUVEI_TRANSACTION_NOT_FOUND',
        });

        const [
          ,
          options,
        ] =
          fetchMock.mock
            .calls[0];

        expect(
          options.method,
        ).toBe(
          'GET',
        );

        expect(
          options.body,
        ).toBeUndefined();
      },
    );
  },
);
