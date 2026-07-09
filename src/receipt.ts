import { sha256Hex } from './merkle';
import type { Market, MarketResult, SettlementReceipt } from './types';
import type { TxlineScoreUpdate, TxlineStatValidation } from './txline/types';

// Stable key order so proofHash is reproducible from the receipt contents.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(',')}}`;
}

export function buildReceipt(args: {
  market: Market;
  finalUpdate: TxlineScoreUpdate;
  validation: TxlineStatValidation;
  proofVerified: boolean;
  result: MarketResult;
  sourceEndpoint: string;
  settlementTx?: string | null;
}): SettlementReceipt {
  const { market, finalUpdate, validation, proofVerified, result, sourceEndpoint } = args;
  const observedValue = `${finalUpdate.scoreSoccer.participant1}-${finalUpdate.scoreSoccer.participant2}`;
  const observed = {
    fixtureId: finalUpdate.fixtureId,
    seq: finalUpdate.seq,
    observedValue,
    statToProve: validation.statToProve,
    eventStatRoot: validation.eventStatRoot,
    condition: market.condition,
    result,
  };
  return {
    receiptId: `${finalUpdate.fixtureId}-${market.marketId}-final`,
    source: 'TxLINE',
    sourceEndpoint,
    network: market.network,
    matchId: finalUpdate.fixtureId,
    marketId: market.marketId,
    observedStat: 'final_score',
    observedValue,
    condition: market.condition,
    result,
    observedAt: finalUpdate.ts,
    proofHash: sha256Hex(canonicalJson(observed)),
    txlineProofRef: validation.eventStatRoot,
    settlementAction: result === 'YES_WINS' ? 'release_to_yes' : 'release_to_no',
    settlementTx: args.settlementTx ?? null,
    status: proofVerified ? 'verified' : 'failed_verification',
  };
}
