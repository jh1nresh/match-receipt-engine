import { describe, expect, it } from 'vitest';
import {
  deriveDailyScoresRootsPda,
  epochDayFromTs,
  parseDailyScoresRoots,
  TXORACLE_PROGRAM_IDS,
} from '../src/txline/anchoring';

describe('epoch day', () => {
  it('computes days since unix epoch', () => {
    expect(epochDayFromTs(0)).toBe(0);
    expect(epochDayFromTs(86_400_000)).toBe(1);
    expect(epochDayFromTs(Date.UTC(2026, 6, 19, 19, 52))).toBe(20653);
  });

  it('rejects out-of-range values', () => {
    expect(() => epochDayFromTs(-1)).toThrow(/u16/);
    expect(() => epochDayFromTs(0x10000 * 86_400_000)).toThrow(/u16/);
  });
});

describe('daily scores roots PDA', () => {
  it('derives deterministically and differs per cluster', () => {
    const a = deriveDailyScoresRootsPda(20653, 'mainnet');
    const b = deriveDailyScoresRootsPda(20653, 'mainnet');
    const c = deriveDailyScoresRootsPda(20653, 'devnet');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
    expect(a.toBase58()).not.toBe(TXORACLE_PROGRAM_IDS.mainnet);
  });

  it('differs per epoch day', () => {
    expect(deriveDailyScoresRootsPda(20653, 'devnet').equals(deriveDailyScoresRootsPda(20654, 'devnet'))).toBe(false);
  });
});

describe('account parsing (assumed layout)', () => {
  it('parses packed 36-byte records after the discriminator', () => {
    const record = (day: number, hour: number, minute: number, fill: number) => {
      const b = Buffer.alloc(36);
      b.writeUInt16LE(day, 0);
      b.writeUInt8(hour, 2);
      b.writeUInt8(minute, 3);
      b.fill(fill, 4);
      return b;
    };
    const data = Buffer.concat([
      Buffer.alloc(8), // anchor discriminator
      record(20653, 10, 30, 0xaa),
      record(0, 0, 0, 0x00), // zero-filled empty slot is skipped, not a stop
      record(20653, 11, 0, 0xbb),
    ]);
    const entries = parseDailyScoresRoots(data, 20653);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ epochDay: 20653, slotMeta: 10 + 30 * 256, rootHex: 'aa'.repeat(32) });
    expect(entries[1]!.rootHex).toBe('bb'.repeat(32));
  });

  it('returns empty for a foreign account shape', () => {
    expect(parseDailyScoresRoots(Buffer.alloc(8), 20653)).toEqual([]);
  });
});
