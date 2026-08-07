export const RANDOMNESS_PROVIDER =
  'RANDOM_ORG';

export const RANDOMNESS_API_VERSION =
  'RANDOM_ORG_SIGNED_API_V4';

export const RANDOMNESS_BINDING_VERSION =
  'AMAZING_CHANCE_RANDOMNESS_BINDING_V1';

export interface RandomnessBinding {
  version: string;
  drawId: string;
  drawPublicId: string;
  snapshotHash: string;
  merkleRoot: string;
  ticketCount: string;
}

export interface RandomOrgSignedRandom {
  method: string;
  hashedApiKey: string;
  n: number;
  min: number;
  max: number;
  replacement: boolean;
  base: number;
  data: number[];
  userData?: unknown;
  completionTime?: string;
  serialNumber?: number;
  [key: string]: unknown;
}

export interface RandomOrgSignedResult {
  random: RandomOrgSignedRandom;
  signature: string;
  bitsUsed?: number;
  bitsLeft?: number;
  requestsLeft?: number;
  advisoryDelay?: number;
  [key: string]: unknown;
}

export interface VerifiedRandomnessResult {
  evidenceId: string;
  drawId: string;
  drawPublicId: string;
  provider: string;
  attemptNumber: number;
  requestedMin: string;
  requestedMax: string;
  requestedCount: number;
  randomPositions: string[];
  responseHash: string;
  providerSignature: string;
  signatureVerified: true;
  verifiedAt: Date;
  alreadyVerified: boolean;
}
