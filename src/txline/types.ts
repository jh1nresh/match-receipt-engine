// TxLINE-shaped types. Field names follow the TxLINE OpenAPI spec
// (https://txline.txodds.com/docs/docs.yaml): Scores schema and
// ScoresStatValidation schema. Hashes are hex strings here; the live API
// serves binary — the live client (P2) must convert at the boundary.

export type TxlineGameState = 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'CANCELLED';

export interface TxlineScoreUpdate {
  fixtureId: string;
  seq: number;
  ts: string;
  participant1Id: string;
  participant2Id: string;
  participant1IsHome: boolean;
  gameState: TxlineGameState;
  scoreSoccer: {
    participant1: number;
    participant2: number;
  };
}

export interface ProofNode {
  hash: string;
  isRightSibling: boolean;
}

// GET /api/scores/stat-validation response shape (normalized).
export interface TxlineStatValidation {
  ts: string;
  statToProve: string;
  eventStatRoot: string;
  statProof: ProofNode[];
  subTreeProof: ProofNode[];
  mainTreeProof: ProofNode[];
  // Fixture summary linking the event tree into the fixture sub-tree
  // (wire: ScoresBatchSummary). Optional: absent on legacy fixtures, which
  // then verify to statProof level only.
  summary?: {
    fixtureId: string;
    eventStatsSubTreeRoot: string;
  };
}

// Where a settlement's daily root came from. 'simulated' = fixture-embedded;
// devnet/mainnet = read from the Txoracle DailyScoresMerkleRoots PDA.
export interface RootAnchor {
  dailyRoot: string;
  source: 'simulated' | 'devnet' | 'mainnet';
}
