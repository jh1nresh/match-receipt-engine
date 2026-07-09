// Generates fixtures/wc-final-replay.json with a Merkle-consistent
// THREE-LEVEL proof chain: stat -> eventStatRoot -> fixture sub-tree root ->
// daily root (simulated on-chain anchor).
// Run: npx tsx scripts/make-fixture.ts
import { writeFileSync } from 'node:fs';
import { buildProofFromLeafHashes, buildStatProof, sha256Hex } from '../src/merkle';
import type { ReplayFixture } from '../src/types';
import type { TxlineScoreUpdate } from '../src/txline/types';

const fixtureId = 'wc2026-final-1001';
const statToProve = `fixture:${fixtureId}:final_score:2-1`;

// Level 1: stats of the final score-update event.
const stats = [
  `fixture:${fixtureId}:ht_score:1-0`,
  `fixture:${fixtureId}:goals_participant1:2`,
  `fixture:${fixtureId}:goals_participant2:1`,
  statToProve,
];
const { eventStatRoot, statProof } = buildStatProof(stats, stats.indexOf(statToProve));

// Level 2: the fixture's event-stat sub-tree — event roots of every score
// update in the fixture; our final event's root is the last leaf.
const otherEventRoots = [1, 2, 3, 4].map((seq) => sha256Hex(`event-root:${fixtureId}:seq:${seq}`));
const eventLeaves = [...otherEventRoots, eventStatRoot];
const sub = buildProofFromLeafHashes(eventLeaves, eventLeaves.length - 1);

// Level 3: daily main tree over fixture sub-tree roots (simulated on-chain
// daily_scores_roots entry).
const otherFixtureRoots = ['wc2026-sf-0998', 'wc2026-sf-0999', 'wc2026-3rd-1000'].map((f) =>
  sha256Hex(`fixture-subtree:${f}`),
);
const mainLeaves = [...otherFixtureRoots, sub.root];
const main = buildProofFromLeafHashes(mainLeaves, mainLeaves.length - 1);

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
    subTreeProof: sub.proof,
    mainTreeProof: main.proof,
    summary: { fixtureId, eventStatsSubTreeRoot: sub.root },
  },
  sourceEndpoint: '/api/scores/stat-validation (replayed fixture)',
  anchoring: { dailyRoot: main.root, source: 'simulated' },
};

writeFileSync(new URL('../fixtures/wc-final-replay.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
console.log('wrote fixtures/wc-final-replay.json');
console.log('  eventStatRoot        ', eventStatRoot);
console.log('  eventStatsSubTreeRoot', sub.root);
console.log('  dailyRoot (simulated)', main.root);
