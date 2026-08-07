import {
  BadGatewayException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

import {
  type RandomnessBinding,
  type RandomOrgSignedResult,
} from './randomness-evidence.types';

const RANDOM_ORG_SIGNED_API_URL =
  'https://api.random.org/json-rpc/4/invoke';

type JsonRpcError = {
  code?: number;
  message?: string;
  data?: unknown;
};

type GenerateSignedIntegersResponse = {
  jsonrpc?: string;
  result?: RandomOrgSignedResult;
  error?: JsonRpcError;
  id?: string;
};

type VerifySignatureResponse = {
  jsonrpc?: string;
  result?: {
    authenticity?: boolean;
  };
  error?: JsonRpcError;
  id?: string;
};

@Injectable()
export class RandomOrgSignedClient {
  constructor(
    private readonly configService: ConfigService,
  ) {}

  async generateSignedIntegers(input: {
    count: number;
    min: number;
    max: number;
    binding: RandomnessBinding;
  }): Promise<RandomOrgSignedResult> {
    const apiKey =
      this.configService.get<string>(
        'RANDOM_ORG_API_KEY',
      );

    if (!apiKey) {
      throw new BadGatewayException(
        'RANDOM_ORG_API_KEY is not configured',
      );
    }

    const requestId = randomUUID();

    const response =
      await this.postJsonRpc<GenerateSignedIntegersResponse>(
        {
          jsonrpc: '2.0',
          method:
            'generateSignedIntegers',
          params: {
            apiKey,
            n: input.count,
            min: input.min,
            max: input.max,
            replacement: false,
            base: 10,
            userData:
              input.binding,
          },
          id: requestId,
        },
      );

    if (
      response.error ||
      !response.result?.random ||
      !response.result.signature
    ) {
      throw new BadGatewayException(
        this.formatProviderError(
          'RANDOM.ORG signed integer request failed',
          response.error,
        ),
      );
    }

    return response.result;
  }

  async verifySignature(input: {
    random: RandomOrgSignedResult['random'];
    signature: string;
  }): Promise<boolean> {
    const requestId = randomUUID();

    const response =
      await this.postJsonRpc<VerifySignatureResponse>(
        {
          jsonrpc: '2.0',
          method:
            'verifySignature',
          params: {
            random: input.random,
            signature:
              input.signature,
          },
          id: requestId,
        },
      );

    if (response.error) {
      throw new BadGatewayException(
        this.formatProviderError(
          'RANDOM.ORG signature verification failed',
          response.error,
        ),
      );
    }

    return (
      response.result?.authenticity ===
      true
    );
  }

  private async postJsonRpc<T>(
    body: unknown,
  ): Promise<T> {
    let response: Response;

    try {
      response = await fetch(
        RANDOM_ORG_SIGNED_API_URL,
        {
          method: 'POST',
          headers: {
            Accept:
              'application/json',
            'Content-Type':
              'application/json',
          },
          body:
            JSON.stringify(body),
          signal:
            AbortSignal.timeout(
              15_000,
            ),
        },
      );
    } catch {
      throw new BadGatewayException(
        'RANDOM.ORG request could not be completed',
      );
    }

    if (!response.ok) {
      throw new BadGatewayException(
        `RANDOM.ORG returned HTTP ${response.status}`,
      );
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new BadGatewayException(
        'RANDOM.ORG returned an invalid JSON response',
      );
    }
  }

  private formatProviderError(
    prefix: string,
    error?: JsonRpcError,
  ): string {
    if (!error?.message) {
      return prefix;
    }

    return `${prefix}: ${error.message}`;
  }
}
