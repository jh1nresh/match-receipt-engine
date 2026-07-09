// Live read-only probe of the Txoracle DailyScoresMerkleRoots PDA.
// Run: npx tsx scripts/check-anchoring.ts [epochDay]
// No wallet, no signing — public RPC account read only.
import { deriveDailyScoresRootsPda, epochDayFromTs, fetchDailyScoresRoots, type Cluster } from '../src/txline/anchoring';

const epochDay = process.argv[2] ? Number(process.argv[2]) : epochDayFromTs(Date.now());

for (const cluster of ['mainnet', 'devnet'] as Cluster[]) {
  const pda = deriveDailyScoresRootsPda(epochDay, cluster);
  process.stdout.write(`${cluster} epochDay=${epochDay} pda=${pda.toBase58()} … `);
  try {
    const account = await fetchDailyScoresRoots(epochDay, cluster);
    if (!account) {
      console.log('account not found (no roots published for this day)');
      continue;
    }
    console.log(`FOUND, ${account.entries.length} parsed entr${account.entries.length === 1 ? 'y' : 'ies'}, raw ${Buffer.from(account.rawBase64, 'base64').length} bytes`);
    for (const e of account.entries.slice(0, 5)) {
      console.log(`  slotMeta=${e.slotMeta} root=${e.rootHex}`);
    }
  } catch (err) {
    console.log(`error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
