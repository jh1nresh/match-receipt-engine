// Generates fixtures/wc-final-replay.json with a Merkle-consistent stat proof.
// Run: npx tsx scripts/make-fixture.ts
import { writeFileSync } from 'node:fs';
import { buildStatProof } from '../src/merkle';
import type { ReplayFixture } from '../src/types';
import type { TxlineScoreUpdate } from '../src/txline/types';

const fixtureId = 'wc2026-final-1001';
const statToProve = `fixture:${fixtureId}:final_score:2-1`;
// Sibling stats that would live in the same TxLINE event-stat tree.
const stats = [
  `fixture:${fixtureId}:ht_score:1-0`,
  `fixture:${fixtureId}:goals_participant1:2`,
  `fixture:${fixtureId}:goals_participant2:1`,
  statToProve,
];
const { eventStatRoot, statProof } = buildStatProof(stats, stats.indexOf(statToProve));

const base = {
  fixtureId,
  participant1Id: 'team-argentina',
  participant2Id: 'team-france',
  participant1IsHome: true,
};

const updates: TxlineScoreUpdate[] = [
  { ...base, seq: 1, ts: '2026-07-19T18:00:00Z', gameState: 'LIVE', scoreSoccer: { participant1: 0, participant2: 0 } },
  { ...base, seq: 2, ts: '2026-07-19T18:23:00Z', gameState: 'LIVE', scoreSoccer: { participant1: 1, participant2: 0 } },
  { ...base, seq: 3, ts: '2026-07-19T19:05:00Z', gameState: 'LIVE', scoreSoccer: { participant1: 1, participant2: 1 } },
  { ...base, seq: 4, ts: '2026-07-19T19:31:00Z', gameState: 'LIVE', scoreSoccer: { participant1: 2, participant2: 1 } },
  { ...base, seq: 5, ts: '2026-07-19T19:52:00Z', gameState: 'FINISHED', scoreSoccer: { participant1: 2, participant2: 1 } },
];

const fixture: ReplayFixture = {
  description: 'World Cup final replay: Argentina beats France 2-1; TEAM_WIN market on Argentina settles YES.',
  market: {
    marketId: 'argentina-wins-final',
    fixtureId,
    marketType: 'TEAM_WIN',
    teamId: 'team-argentina',
    condition: 'team-argentina goals > team-france goals at FINISHED',
    network: 'simulated',
  },
  stakes: [
    { staker: 'alice', side: 'YES', amount: 600 },
    { staker: 'bob', side: 'YES', amount: 400 },
    { staker: 'carol', side: 'NO', amount: 500 },
  ],
  updates,
  validation: {
    ts: '2026-07-19T19:53:00Z',
    statToProve,
    eventStatRoot,
    statProof,
    subTreeProof: [],
    mainTreeProof: [],
  },
  sourceEndpoint: '/api/scores/stat-validation (replayed fixture)',
};

writeFileSync(new URL('../fixtures/wc-final-replay.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
console.log('wrote fixtures/wc-final-replay.json, eventStatRoot', eventStatRoot);
