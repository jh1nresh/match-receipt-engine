import { describe, expect, it } from 'vitest';
import { adaptScores, adaptStatValidation, mapGameState, toHex, totalGoals } from '../src/txline/adapter';
import type { WireScores, WireScoresStatValidation } from '../src/txline/wire';

const score = (goals: number) => ({ Goals: goals, YellowCards: 0, RedCards: 0, Corners: 0 });

const wireScores: WireScores = {
  fixtureId: 4711,
  gameState: 'END',
  startTime: 1784800800000,
  participant1IsHome: true,
  participant1Id: 101,
  participant2Id: 202,
  id: 1,
  ts: 1784807700000,
  seq: 42,
  scoreSoccer: {
    Participant1: { H1: score(1), H2: score(1) },
    Participant2: { H1: score(0), H2: score(1) },
  },
};

describe('gameState mapping', () => {
  it('maps known finished states', () => {
    for (const s of ['FINISHED', 'FT', 'END', 'ended', 'FET']) expect(mapGameState(s)).toBe('FINISHED');
  });

  it('never treats unknown states as final', () => {
    expect(mapGameState('SOME_FUTURE_STATE')).toBe('LIVE');
    expect(mapGameState('H2')).toBe('LIVE');
  });

  it('maps scheduled and cancelled states', () => {
    expect(mapGameState('NOT_STARTED')).toBe('SCHEDULED');
    expect(mapGameState('ABANDONED')).toBe('CANCELLED');
  });
});

describe('goal totalling', () => {
  it('sums periods and skips the HT snapshot', () => {
    expect(totalGoals({ H1: score(1), HT: score(1), H2: score(2), ET1: score(1) })).toBe(4);
  });

  it('skips HT case-insensitively', () => {
    expect(totalGoals({ H1: score(1), ht: score(1), H2: score(2) })).toBe(3);
  });

  it('handles missing score blocks', () => {
    expect(totalGoals(undefined)).toBe(0);
  });

  it('rejects non-integer or negative Goals from the wire', () => {
    expect(() => totalGoals({ H1: { ...score(0), Goals: Number.NaN } })).toThrow(/invalid Goals/);
    expect(() => totalGoals({ H1: { ...score(0), Goals: -1 } })).toThrow(/invalid Goals/);
    expect(() => totalGoals({ H1: { ...score(0), Goals: '2' as unknown as number } })).toThrow(/invalid Goals/);
  });
});

describe('hash conversion', () => {
  it('passes through hex unchanged', () => {
    expect(toHex('DEADBEEF')).toBe('deadbeef');
  });

  it('converts base64 to hex', () => {
    expect(toHex(Buffer.from('deadbeef', 'hex').toString('base64'))).toBe('deadbeef');
  });
});

describe('scores adaptation', () => {
  it('normalizes a wire Scores payload into an internal update', () => {
    const update = adaptScores(wireScores);
    expect(update).toEqual({
      fixtureId: '4711',
      seq: 42,
      ts: new Date(1784807700000).toISOString(),
      participant1Id: '101',
      participant2Id: '202',
      participant1IsHome: true,
      gameState: 'FINISHED',
      scoreSoccer: { participant1: 2, participant2: 1 },
    });
  });
});

describe('stat validation adaptation', () => {
  it('converts hashes to hex and stat to a canonical string', () => {
    const wire: WireScoresStatValidation = {
      ts: 1784807760000,
      statToProve: { key: 1, value: 2, period: 0 },
      eventStatRoot: Buffer.from('ab'.repeat(32), 'hex').toString('base64'),
      summary: { fixtureId: 4711, eventStatsSubTreeRoot: '' },
      statProof: [{ hash: Buffer.from('cd'.repeat(32), 'hex').toString('base64'), isRightSibling: true }],
      subTreeProof: [],
      mainTreeProof: [],
    };
    const internal = adaptStatValidation(4711, 42, wire);
    expect(internal.statToProve).toBe('fixture:4711:seq:42:stat:key=1:value=2:period=0');
    expect(internal.eventStatRoot).toBe('ab'.repeat(32));
    expect(internal.statProof[0]).toEqual({ hash: 'cd'.repeat(32), isRightSibling: true });
  });
});
