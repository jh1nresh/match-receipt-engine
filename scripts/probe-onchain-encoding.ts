// LiteSVM harness for reverse-engineering / validating the Txoracle on-chain
// proof encoding. Runs the dumped devnet program locally and reports
// validate_stat's diagnostic error codes. No wallet, no SOL — read-only
// inputs (program dump + one real account fetch), everything else local.
//
// Prereq (one-time, read-only): dump the program next to the scratch dir —
//   solana program dump -u devnet 6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J <scratchDir>/txoracle-devnet.so
// Run: npx tsx scripts/probe-onchain-encoding.ts <scratchDir>
//
// CONFIRMED findings (2026-07-09, from this harness):
//   - validate_stat ts is UNIX MILLISECONDS; program derives
//     epochDay = ts / 86_400_000 and interval = (ts % day) / 300_000
//     (5-min slots). Wrong units -> ConstraintSeeds (2006).
//   - ScoreStat = { key: u32, value: i32, period: i32 } (key is UNSIGNED).
//   - Anchor enum variants encode by their PascalCase IDL name.
//   - anchor@0.32 JS BorshInstructionCoder mis-encodes this IDL's defined
//     types (zeroed payload -> InstructionDidNotDeserialize 0x66); the
//     instruction is hand-borsh-encoded here instead.
//   - Hash primitive is sol_sha256 (single, confirmed via `strings` on .so).
// STILL OPEN: the exact main-tree leaf preimage (summary -> daily-root leaf).
// Resolve by feeding a REAL /api/scores/stat-validation payload (needs
// activation) into runReal() below, where proofs are non-empty and correct.
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { LiteSVM } from 'litesvm';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PROGRAM_ID = new PublicKey('6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J');
const EPOCH_DAY = 20641;
const REAL_PDA = new PublicKey('GRJBcG6G9CnvvNZPQagxietR7caFtAG8sFRZ2mg5n8QZ');
const ROOTS_OFFSET = 12; // disc(8) + epoch_day u16 + 2 unknown bytes
const INTERVALS = 288; // 5-min slots per day

const scratch = process.argv[2];
if (!scratch) throw new Error('usage: tsx scripts/probe-onchain-encoding.ts <scratchDir>');
const soPath = join(scratch, 'txoracle-devnet.so');

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest();
const i32 = (n: number) => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; };
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const i64 = (n: number | bigint) => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(n)); return b; };

// -- real account data (cached)
const acctPath = join(scratch, 'daily-roots-20641-devnet.bin');
if (!existsSync(acctPath)) {
  const info = await new Connection('https://api.devnet.solana.com', 'confirmed').getAccountInfo(REAL_PDA);
  if (!info) throw new Error('real account fetch failed');
  writeFileSync(acctPath, info.data);
}
const realData = readFileSync(acctPath);

const idl = JSON.parse(readFileSync(new URL('../idl/txoracle-devnet.json', import.meta.url), 'utf8')) as {
  instructions: Array<{ name: string; discriminator: number[] }>;
};
// anchor 0.32's JS BorshInstructionCoder silently mis-encodes this IDL's
// defined types (zeroed payload), so the instruction is borsh-encoded by
// hand from the IDL type definitions.
const VALIDATE_STAT_DISC = Buffer.from(idl.instructions.find((i) => i.name === 'validate_stat')!.discriminator);

function encodeValidateStat(args: {
  ts: number;
  summary: { fixtureId: number; updateCount: number; minTs: number; maxTs: number; subRoot: Buffer };
  fixtureProof: Buffer[];
  mainTreeProof: Buffer[];
  threshold: number;
  comparison: number; // 0 GreaterThan, 1 LessThan, 2 EqualTo
  statA: { key: number; value: number; period: number; eventStatRoot: Buffer; statProof: Array<{ hash: Buffer; isRight: boolean }> };
}): Buffer {
  const vecLen = (n: number) => u32(n);
  const proofVec = (nodes: Array<{ hash: Buffer; isRight: boolean }>) =>
    Buffer.concat([vecLen(nodes.length), ...nodes.map((n) => Buffer.concat([n.hash, Buffer.from([n.isRight ? 1 : 0])]))]);
  const rawVec = (hashes: Buffer[]) => proofVec(hashes.map((h) => ({ hash: h, isRight: false })));
  void rawVec;
  return Buffer.concat([
    VALIDATE_STAT_DISC,
    i64(args.ts),
    i64(args.summary.fixtureId),
    i32(args.summary.updateCount),
    i64(args.summary.minTs),
    i64(args.summary.maxTs),
    args.summary.subRoot,
    proofVec(args.fixtureProof.map((h) => ({ hash: h, isRight: false }))),
    proofVec(args.mainTreeProof.map((h) => ({ hash: h, isRight: false }))),
    i32(args.threshold),
    Buffer.from([args.comparison]),
    u32(args.statA.key),
    i32(args.statA.value),
    i32(args.statA.period),
    args.statA.eventStatRoot,
    proofVec(args.statA.statProof),
    Buffer.from([0]), // Option<StatTerm> stat_b = None
    Buffer.from([0]), // Option<BinaryExpression> op = None
  ]);
}

// stat + summary used across hypotheses
const stat = { key: 1, value: 2, period: 0 }; // ScoreStat { key: u32, value: i32, period: i32 }
// ts is UNIX MILLISECONDS (program derives epochDay = ts / 86_400_000 —
// confirmed via ConstraintSeeds probe), 5-min aligned, inside the epoch day.
const ts = (EPOCH_DAY * 86400 + 100 * 300) * 1000;
const statBorsh = Buffer.concat([u32(stat.key), i32(stat.value), i32(stat.period)]);

function summaryBorsh(s: { fixtureId: number; updateCount: number; minTs: number; maxTs: number; subRoot: Buffer }) {
  return Buffer.concat([i64(s.fixtureId), i32(s.updateCount), i64(s.minTs), i64(s.maxTs), s.subRoot]);
}

interface Hypothesis {
  name: string;
  leaf: () => Buffer; // hash of stat -> event_stat_root (empty statProof)
  daily: (subRoot: Buffer, sum: { fixtureId: number; updateCount: number; minTs: number; maxTs: number }) => Buffer;
}

// Layer 1: crack the main-tree leaf (validation order is main -> fixture ->
// stat, so the error code tells us when this layer passes).
const statLeaf = () => sha256(statBorsh);
const H: Hypothesis[] = [
  { name: 'daily=sha256(fid,cnt,min,max,subRoot) [borsh order]', leaf: statLeaf, daily: (r, s) => sha256(Buffer.concat([i64(s.fixtureId), i32(s.updateCount), i64(s.minTs), i64(s.maxTs), r])) },
  { name: 'daily=sha256(subRoot,fid,cnt,min,max)', leaf: statLeaf, daily: (r, s) => sha256(Buffer.concat([r, i64(s.fixtureId), i32(s.updateCount), i64(s.minTs), i64(s.maxTs)])) },
  { name: 'daily=sha256(fid,subRoot)', leaf: statLeaf, daily: (r, s) => sha256(Buffer.concat([i64(s.fixtureId), r])) },
  { name: 'daily=sha256(subRoot)', leaf: statLeaf, daily: (r) => sha256(r) },
  { name: 'daily=subRoot raw', leaf: statLeaf, daily: (r) => r },
  { name: 'daily=sha256(sha256(borsh(summary)))', leaf: statLeaf, daily: (r, s) => sha256(sha256(Buffer.concat([i64(s.fixtureId), i32(s.updateCount), i64(s.minTs), i64(s.maxTs), r]))) },
  { name: 'daily=sha256(fid,min,max,cnt,subRoot)', leaf: statLeaf, daily: (r, s) => sha256(Buffer.concat([i64(s.fixtureId), i64(s.minTs), i64(s.maxTs), i32(s.updateCount), r])) },
  { name: 'daily=sha256(fid i32,cnt,min,max,subRoot)', leaf: statLeaf, daily: (r, s) => sha256(Buffer.concat([i32(s.fixtureId), i32(s.updateCount), i64(s.minTs), i64(s.maxTs), r])) },
];

const payer = Keypair.generate();

function runOnce(hyp: Hypothesis): { err: string | null; logs: string[] } {
  const svm = new LiteSVM();
  svm.addProgramFromFile(PROGRAM_ID, soPath);
  svm.airdrop(payer.publicKey, 10_000_000_000n);

  const eventStatRoot = hyp.leaf(); // statProof = []
  const subRoot = eventStatRoot; // fixtureProof = []
  const sumFields = { fixtureId: 4711, updateCount: 1, minTs: ts, maxTs: ts, subRoot };
  const dailyRoot = hyp.daily(subRoot, sumFields); // mainProof = []

  const data = Buffer.from(realData);
  for (let i = 0; i < INTERVALS; i++) dailyRoot.copy(data, ROOTS_OFFSET + i * 32);
  svm.setAccount(REAL_PDA, { lamports: 100_000_000, data, owner: PROGRAM_ID, executable: false });

  const ixData = encodeValidateStat({
    ts,
    summary: sumFields,
    fixtureProof: [],
    mainTreeProof: [],
    threshold: 1,
    comparison: 0,
    statA: { ...stat, eventStatRoot, statProof: [] },
  });
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [{ pubkey: REAL_PDA, isSigner: false, isWritable: false }],
    data: ixData,
  });
  const tx = new Transaction().add(ix);
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = svm.latestBlockhash();
  tx.sign(payer);
  const res = svm.sendTransaction(tx);
  if (res.constructor.name === 'FailedTransactionMetadata') {
    const failed = res as unknown as { err: () => unknown; meta: () => { logs: () => string[] } };
    return { err: JSON.stringify(failed.err()), logs: failed.meta().logs() };
  }
  const ok = res as unknown as { logs: () => string[] };
  return { err: null, logs: ok.logs() };
}

for (const hyp of H) {
  try {
    const { err, logs } = runOnce(hyp);
    const errLine = logs.find((l) => l.includes('Error Code')) ?? (err ? `err ${err}` : 'NONE — VALIDATED ✓');
    console.log(`${hyp.name}\n   -> ${errLine.replace(/^Program log: /, '')}`);
    if (!errLine.includes('InvalidMainTreeProof')) for (const l of logs.slice(-6)) console.log('  ', l);
  } catch (e) {
    console.log(`${hyp.name}\n   -> threw: ${e instanceof Error ? e.message : String(e)}`);
  }
}
