export const LedgerIntegrityIssueCodes = {
  TRANSACTION_UNSEALED:
    'TRANSACTION_UNSEALED',
  TRANSACTION_WITHOUT_POSTINGS:
    'TRANSACTION_WITHOUT_POSTINGS',
  NON_POSITIVE_POSTING:
    'NON_POSITIVE_POSTING',
  UNBALANCED_TRANSACTION:
    'UNBALANCED_TRANSACTION',
} as const;

export type LedgerIntegrityIssueCode =
  (typeof LedgerIntegrityIssueCodes)[keyof typeof LedgerIntegrityIssueCodes];

export interface LedgerIntegrityIssue {
  code: LedgerIntegrityIssueCode;
  transactionId: string;
  details: string;
}

export interface LedgerIntegrityReport {
  healthy: boolean;
  checkedAt: string;
  checkedTransactions: number;
  checkedPostings: number;
  sealedTransactions: number;
  unsealedTransactions: number;
  balancedTransactions: number;
  unbalancedTransactions: number;
  transactionsWithoutPostings: number;
  nonPositivePostings: number;
  issues: LedgerIntegrityIssue[];
}
