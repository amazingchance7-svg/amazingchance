export interface WinnerPositionSelectionInput {
  randomPositions: unknown;
  winnerCount: number;
  snapshotEntryCount: bigint;
}

export interface WinnerPositionSelectionResult {
  positions: bigint[];
  suppliedPositionCount: number;
  duplicatePositionCount: number;
}

export interface SelectedWinner {
  id: string;
  rank: number;
  ticketId: string;
  ticketPublicId: string;
  ownerPublicRef: string;
  snapshotEntryId: string;
  randomPosition: string;
}

export interface FinalizeWinnerSelectionResult {
  drawId: string;
  drawPublicId: string;
  status: 'COMPLETED' | 'PUBLISHED';
  randomnessEvidenceId: string;
  snapshotId: string;
  snapshotHash: string;
  merkleRoot: string;
  completedAt: Date;
  alreadyCompleted: boolean;
  winners: SelectedWinner[];
}
