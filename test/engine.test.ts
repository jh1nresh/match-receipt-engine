import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SettlementEngine } from '../src/engine.js';
import { SimulatedEscrowLedger } from '../src/ledger.js';
import { buildStatProof, foldProof, sha256Hex, verifyStatProof } from '../src/merkle.js';
import { canonicalJson } from '../src/receipt.js';
import { resolveMarket } from '../src/resolver.js';
import { runReplay } from '../src/replay.js';
import { IllegalTransitionError, isTerminal, transition } from '../src/stateMachine.js';
import type { Market, ReplayFixture } from '../src/types.js';
import type { TxlineScoreUpdate } from '../src/txline/types.js';

const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/wc-final-replay.json', import.meta.url), 'utf8'),
) as ReplayFixture;

const market: Market = { ...fixture.market, state: 'created' };

function finalUpdate(p1: number, p2: number): TxlineScoreUpdate {
  return {
    fixtureId: market.fixtureId,
    seq: 99,
    ts: '2026-07-19T20:00:00Z',
    participant1Id: 'team-argentina',
    participant2Id: 'team-france',
    participant1IsHome: true,
    gameState: 'FINISHED',
    scoreSoccer: { participant1: p1, participant2: p2 },
  };
}

describe('merkle proof verification (F3/F4)', () => {
  it('verifies a consistent stat proof', () => {
    expect(verifyStatProof(fixture.validation)).toBe(true);
  });

  it('rejects a tampered stat value', () => {
    const tampered = { ...fixture.validation, statToProve: fixture.validation.statToProve.replace('2-1', '3-1') };
    expect(verifyStatProof(tampered)).toBe(false);
  });

  it('rejects a tampered root', () => {
    const tampered = { ...fixture.validation, eventStatRoot: sha256Hex('forged') };
    expect(verifyStatProof(tampered)).toBe(false);
  });

  it('buildStatProof round-trips for every leaf, including odd tree widths', () => {
    const stats = ['a', 'b', 'c', 'd', 'e'];
    for (let i = 0; i < stats.length; i++) {
      const { eventStatRoot, statProof } = buildStatProof(stats, i);
      expect(foldProof(sha256Hex(stats[i]!), statProof)).toBe(eventStatRoot);
    }
  });
});

describe('deterministic resolver (F3)', () => {
  it('team win resolves YES', () => {
    expect(resolveMarket(market, finalUpdate(2, 1))).toBe('YES_WINS');
  });

  it('draw resolves NO (win-only market)', () => {
    expect(resolveMarket(market, finalUpdate(1, 1))).toBe('NO_WINS');
  });

  it('loss resolves NO', () => {
    expect(resolveMarket(market, finalUpdate(0, 2))).toBe('NO_WINS');
  });

  it('is deterministic across repeated calls', () => {
    const results = new Set(Array.from({ length: 50 }, () => resolveMarket(market, finalUpdate(2, 1))));
    expect(results.size).toBe(1);
  });

  it('refuses to resolve a non-final update', () => {
    expect(() => resolveMarket(market, { ...finalUpdate(2, 1), gameState: 'LIVE' })).toThrow(/final result required/);
  });

  it('refuses a team not in the fixture', () => {
    expect(() => resolveMarket({ ...market, teamId: 'team-brazil' }, finalUpdate(2, 1))).toThrow(/not in fixture/);
  });
});

describe('settlement state machine', () => {
  it('walks the happy path', () => {
    let s = transition('created', 'funded_or_simulated');
    s = transition(s, 'awaiting_result');
    s = transition(s, 'receipt_observed');
    s = transition(s, 'proof_verified_or_simulated');
    s = transition(s, 'settled_yes');
    expect(isTerminal(s)).toBe(true);
  });

  it('blocks settlement before proof verification', () => {
    expect(() => transition('receipt_observed', 'settled_yes')).toThrow(IllegalTransitionError);
  });

  it('blocks re-settling a terminal market', () => {
    expect(() => transition('settled_yes', 'refunded')).toThrow(IllegalTransitionError);
  });

  it('routes dispute review to refund or settlement only', () => {
    expect(transition('needs_dispute_review', 'refunded')).toBe('refunded');
    expect(() => transition('needs_dispute_review', 'awaiting_result')).toThrow(IllegalTransitionError);
  });
});

describe('simulated escrow ledger (F6)', () => {
  it('pays winners pro-rata and reports dust explicitly', () => {
    const ledger = new SimulatedEscrowLedger();
    ledger.fund('m1', { staker: 'alice', side: 'YES', amount: 600 });
    ledger.fund('m1', { staker: 'bob', side: 'YES', amount: 400 });
    ledger.fund('m1', { staker: 'carol', side: 'NO', amount: 500 });
    const { payouts, dust } = ledger.settle('m1', 'YES_WINS');
    expect(payouts).toEqual([
      { staker: 'alice', amount: 900, kind: 'winnings' },
      { staker: 'bob', amount: 600, kind: 'winnings' },
    ]);
    expect(dust).toBe(0);
    expect(payouts.reduce((s, p) => s + p.amount, 0) + dust).toBe(1500);
  });

  it('refunds everyone when nobody backed the winning side', () => {
    const ledger = new SimulatedEscrowLedger();
    ledger.fund('m1', { staker: 'alice', side: 'YES', amount: 100 });
    const { payouts } = ledger.settle('m1', 'NO_WINS');
    expect(payouts).toEqual([{ staker: 'alice', amount: 100, kind: 'refund' }]);
  });

  it('conserves value under floor division', () => {
    const ledger = new SimulatedEscrowLedger();
    ledger.fund('m1', { staker: 'a', side: 'YES', amount: 1 });
    ledger.fund('m1', { staker: 'b', side: 'YES', amount: 1 });
    ledger.fund('m1', { staker: 'c', side: 'NO', amount: 1 });
    const { payouts, dust } = ledger.settle('m1', 'YES_WINS');
    expect(payouts.reduce((s, p) => s + p.amount, 0) + dust).toBe(3);
    expect(dust).toBe(1);
  });

  it('refuses double settlement', () => {
    const ledger = new SimulatedEscrowLedger();
    ledger.fund('m1', { staker: 'alice', side: 'YES', amount: 100 });
    ledger.settle('m1', 'YES_WINS');
    expect(() => ledger.refund('m1')).toThrow(/already settled/);
  });
});

describe('replay end-to-end (F5)', () => {
  it('settles the fixture market YES with a verified receipt', () => {
    const outcome = runReplay(fixture);
    expect(outcome.market.state).toBe('settled_yes');
    expect(outcome.receipt).not.toBeNull();
    const receipt = outcome.receipt!;
    expect(receipt.status).toBe('verified');
    expect(receipt.network).toBe('simulated');
    expect(receipt.result).toBe('YES_WINS');
    expect(receipt.observedValue).toBe('2-1');
    expect(receipt.settlementAction).toBe('release_to_yes');
    expect(receipt.settlementTx).toBeNull();
    expect(receipt.txlineProofRef).toBe(fixture.validation.eventStatRoot);
    expect(outcome.payouts.map((p) => p.staker)).toEqual(['alice', 'bob']);
  });

  it('produces an inspectable timeline covering every lifecycle stage (F4)', () => {
    const outcome = runReplay(fixture);
    const states = outcome.timeline.map((e) => e.state);
    for (const required of ['created', 'funded_or_simulated', 'awaiting_result', 'receipt_observed', 'proof_verified_or_simulated', 'settled_yes']) {
      expect(states).toContain(required);
    }
  });

  it('routes a tampered proof to dispute review and refunds, never settles (F3)', () => {
    const tampered: ReplayFixture = {
      ...fixture,
      validation: { ...fixture.validation, statToProve: fixture.validation.statToProve.replace('2-1', '9-0') },
    };
    const outcome = runReplay(tampered);
    expect(outcome.market.state).toBe('refunded');
    expect(outcome.receipt).toBeNull();
    expect(outcome.payouts.every((p) => p.kind === 'refund')).toBe(true);
    expect(outcome.payouts.reduce((s, p) => s + p.amount, 0)).toBe(1500);
  });

  it('receipt proofHash is reproducible from receipt contents', () => {
    const a = runReplay(fixture).receipt!;
    const b = runReplay(fixture).receipt!;
    expect(a.proofHash).toBe(b.proofHash);
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
});

describe('engine guards', () => {
  it('refuses proof attachment before a final result', () => {
    const engine = new SettlementEngine(fixture.market);
    engine.fund(fixture.stakes);
    expect(() => engine.attachProof(fixture.validation)).toThrow(/no final result/);
  });

  it('ignores updates for other fixtures', () => {
    const engine = new SettlementEngine(fixture.market);
    engine.fund(fixture.stakes);
    engine.observe({ ...finalUpdate(2, 1), fixtureId: 'other-fixture' });
    expect(engine.state).toBe('awaiting_result');
  });
});
