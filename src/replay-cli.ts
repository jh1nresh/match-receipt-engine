// Prints the full inspectable trail for a replay fixture.
// Run: npm run replay
import { readFileSync } from 'node:fs';
import { runReplay } from './replay.js';
import type { ReplayFixture } from './types.js';

const path = process.argv[2];
if (!path) {
  console.error('usage: tsx src/replay-cli.ts <fixture.json>');
  process.exit(1);
}
const fixture = JSON.parse(readFileSync(path, 'utf8')) as ReplayFixture;
const outcome = runReplay(fixture);

console.log(`\n${fixture.description}\n`);
console.log('TIMELINE');
for (const e of outcome.timeline) console.log(`  [${e.at}] ${e.state.padEnd(28)} ${e.detail}`);
console.log('\nRECEIPT');
console.log(JSON.stringify(outcome.receipt, null, 2));
console.log('\nPAYOUTS (network: simulated)');
for (const p of outcome.payouts) console.log(`  ${p.staker}: ${p.amount} (${p.kind})`);
if (outcome.dust > 0) console.log(`  dust retained in ledger: ${outcome.dust}`);
