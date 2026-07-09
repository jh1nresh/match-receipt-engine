import type { TxlineGameState, TxlineScoreUpdate, TxlineStatValidation } from './types';
import type { WireProofNode, WireScores, WireScoresStatValidation, WireSoccerTotalScore } from './wire';

// Wire -> internal normalization. The engine only ever sees internal types;
// everything TxLINE-specific (int IDs, epoch ts, per-period scores, binary
// hashes) is converted here.

// Settlement must only ever trigger on states we positively recognize as
// final. Unknown gameState strings stay non-final.
const FINISHED_STATES = new Set(['FINISHED', 'FT', 'END', 'ENDED', 'FET', 'AET', 'FINISHED_AFTER_PENALTIES']);
const SCHEDULED_STATES = new Set(['SCHEDULED', 'NOT_STARTED', 'PREMATCH']);
const CANCELLED_STATES = new Set(['CANCELLED', 'ABANDONED', 'POSTPONED']);

export function mapGameState(wire: string): TxlineGameState {
  const s = wire.toUpperCase();
  if (FINISHED_STATES.has(s)) return 'FINISHED';
  if (SCHEDULED_STATES.has(s)) return 'SCHEDULED';
  if (CANCELLED_STATES.has(s)) return 'CANCELLED';
  return 'LIVE';
}

// Sum goals across all periods present (H1 + H2 + ET1 + ...). HT is a
// half-time snapshot contained within H1+H2 totals on some feeds; TxLINE
// serves per-period entries, so summing all except HT avoids double counting.
export function totalGoals(score: WireSoccerTotalScore | undefined): number {
  if (!score) return 0;
  let goals = 0;
  for (const [period, entry] of Object.entries(score)) {
    if (period.toUpperCase() === 'HT' || !entry) continue;
    // Trust boundary: wire data is untrusted JSON. A non-integer or negative
    // Goals must reject the feed here, never steer resolution downstream.
    if (!Number.isInteger(entry.Goals) || entry.Goals < 0) {
      throw new Error(`invalid Goals value in period ${period}: ${String(entry.Goals)}`);
    }
    goals += entry.Goals;
  }
  return goals;
}

export function toHex(wireHash: string): string {
  if (/^[0-9a-f]+$/i.test(wireHash) && wireHash.length % 2 === 0) return wireHash.toLowerCase();
  return Buffer.from(wireHash, 'base64').toString('hex');
}

function toHexNodes(nodes: WireProofNode[]): { hash: string; isRightSibling: boolean }[] {
  return nodes.map((n) => ({ hash: toHex(n.hash), isRightSibling: n.isRightSibling }));
}

export function adaptScores(wire: WireScores): TxlineScoreUpdate {
  return {
    fixtureId: String(wire.fixtureId),
    seq: wire.seq,
    ts: new Date(wire.ts).toISOString(),
    participant1Id: String(wire.participant1Id),
    participant2Id: String(wire.participant2Id),
    participant1IsHome: wire.participant1IsHome,
    gameState: mapGameState(wire.gameState),
    scoreSoccer: {
      participant1: totalGoals(wire.scoreSoccer?.Participant1),
      participant2: totalGoals(wire.scoreSoccer?.Participant2),
    },
  };
}

// Canonical stat string for display and receipt hashing. NOTE: TxLINE's
// on-chain leaf encoding for ScoreStat is not documented in the OpenAPI spec,
// so live proofs cannot be independently re-verified yet (fixture proofs use
// our own encoding and verify fully). Tracked as a TxLINE API feedback item.
export function statToCanonicalString(fixtureId: number, seq: number, stat: { key: number; value: number; period: number }): string {
  return `fixture:${fixtureId}:seq:${seq}:stat:key=${stat.key}:value=${stat.value}:period=${stat.period}`;
}

export function adaptStatValidation(fixtureId: number, seq: number, wire: WireScoresStatValidation): TxlineStatValidation {
  return {
    ts: new Date(wire.ts).toISOString(),
    statToProve: statToCanonicalString(fixtureId, seq, wire.statToProve),
    eventStatRoot: toHex(wire.eventStatRoot),
    statProof: toHexNodes(wire.statProof),
    subTreeProof: toHexNodes(wire.subTreeProof),
    mainTreeProof: toHexNodes(wire.mainTreeProof),
  };
}
