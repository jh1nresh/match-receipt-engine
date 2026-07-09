import type { TxlineScoreUpdate, TxlineStatValidation } from './txline/types.js';

export type MarketState =
  | 'created'
  | 'funded_or_simulated'
  | 'awaiting_result'
  | 'receipt_observed'
  | 'proof_verified_or_simulated'
  | 'settled_yes'
  | 'settled_no'
  | 'refunded'
  | 'needs_dispute_review';

export type Network = 'simulated' | 'devnet' | 'mainnet';

export type MarketResult = 'YES_WINS' | 'NO_WINS';

// v0 supports exactly one market type: does `teamId` win the fixture?
// Draw resolves NO — the market is "team wins", not "team does not lose".
export interface Market {
  marketId: string;
  fixtureId: string;
  marketType: 'TEAM_WIN';
  teamId: string;
  condition: string;
  network: Network;
  state: MarketState;
}

export type Side = 'YES' | 'NO';

export interface SettlementReceipt {
  receiptId: string;
  source: 'TxLINE';
  sourceEndpoint: string;
  network: Network;
  matchId: string;
  marketId: string;
  observedStat: string;
  observedValue: string;
  condition: string;
  result: MarketResult;
  observedAt: string;
  proofHash: string;
  txlineProofRef: string;
  settlementAction: 'release_to_yes' | 'release_to_no' | 'refund_all';
  settlementTx: string | null;
  status: 'verified' | 'simulated_proof' | 'failed_verification';
}

export interface TimelineEvent {
  at: string;
  state: MarketState;
  detail: string;
}

export interface ReplayFixture {
  description: string;
  market: Omit<Market, 'state'>;
  stakes: Array<{ staker: string; side: Side; amount: number }>;
  updates: TxlineScoreUpdate[];
  validation: TxlineStatValidation;
  sourceEndpoint: string;
}
