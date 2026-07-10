// Devnet-only TxLINE free-tier activation with a DISPOSABLE keypair.
// Flow (per https://txline.txodds.com/documentation/worldcup):
//   1. generate throwaway keypair, airdrop devnet SOL
//   2. guest JWT from txline-dev
//   3. on-chain `subscribe(serviceLevel, weeks)` on the devnet Txoracle
//      program (free tier: no TxL payment; simulated before sending)
//   4. wallet-sign `${txSig}:${leagues}:${jwt}` -> POST /api/token/activate
//   5. save credentials OUTSIDE the repo and probe the data endpoints,
//      dumping raw payloads for serialization analysis
// Run: npx tsx scripts/txline-activate-devnet.ts <stateDir>
// Never run against mainnet. Never commit the state dir.
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Devnet Txoracle program (docs /documentation/programs/addresses); also in
// src/txline/anchoring.ts once PR #4 lands.
const TXORACLE_DEVNET = '6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J';
const API_BASE = 'https://txline-dev.txodds.com';
const RPC = 'https://api.devnet.solana.com';
const SERVICE_LEVEL = Number(process.env.TXLINE_SERVICE_LEVEL ?? 1); // 1 = free 60s-delay tier
const DURATION_WEEKS = 4;
const LEAGUES: number[] = [];

const stateDir = process.argv[2];
if (!stateDir) {
  console.error('usage: tsx scripts/txline-activate-devnet.ts <stateDir-outside-repo>');
  process.exit(1);
}
mkdirSync(stateDir, { recursive: true });
const save = (name: string, value: unknown) =>
  writeFileSync(join(stateDir, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2));

// -- 1. disposable keypair (persisted in the state dir so reruns are idempotent)
const keyPath = join(stateDir, 'disposable-devnet-keypair.json');
const keypair = existsSync(keyPath)
  ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keyPath, 'utf8'))))
  : Keypair.generate();
writeFileSync(keyPath, JSON.stringify(Array.from(keypair.secretKey)));
console.log('disposable pubkey:', keypair.publicKey.toBase58());

const connection = new Connection(RPC, 'confirmed');
let balance = await connection.getBalance(keypair.publicKey);
console.log('balance:', balance / LAMPORTS_PER_SOL, 'SOL');
if (balance < 0.05 * LAMPORTS_PER_SOL) {
  console.log('requesting devnet airdrop…');
  const sig = await connection.requestAirdrop(keypair.publicKey, LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, 'confirmed');
  balance = await connection.getBalance(keypair.publicKey);
  console.log('balance after airdrop:', balance / LAMPORTS_PER_SOL, 'SOL');
}

// -- 2. guest JWT
const jwtPath = join(stateDir, 'guest-jwt.txt');
let jwt: string;
if (existsSync(jwtPath)) {
  jwt = readFileSync(jwtPath, 'utf8').trim();
  console.log('reusing guest JWT');
} else {
  const res = await fetch(`${API_BASE}/auth/guest/start`, { method: 'POST' });
  if (!res.ok) throw new Error(`guest/start ${res.status}: ${await res.text()}`);
  jwt = ((await res.json()) as { token: string }).token;
  save('guest-jwt.txt', jwt);
  console.log('guest JWT acquired (devnet)');
}

// -- 3. on-chain free-tier subscribe (devnet)
const txSigPath = join(stateDir, 'subscribe-txsig.txt');
let txSig: string;
if (existsSync(txSigPath)) {
  txSig = readFileSync(txSigPath, 'utf8').trim();
  console.log('reusing subscription tx:', txSig);
} else {
  const provider = new AnchorProvider(connection, new Wallet(keypair), { commitment: 'confirmed' });
  const idl = await Program.fetchIdl(TXORACLE_DEVNET, provider);
  if (!idl) throw new Error('devnet Txoracle IDL not published on-chain; cannot build subscribe ix');
  save('txoracle-devnet-idl.json', idl);
  console.log('IDL fetched:', idl.metadata?.name ?? 'txoracle', '— instructions:', idl.instructions.map((i) => i.name).join(', '));
  const program = new Program(idl, provider);

  const subscribe = program.methods.subscribe;
  if (!subscribe) throw new Error(`subscribe instruction missing from IDL (${idl.instructions.map((i) => i.name).join(', ')})`);
  const builder = subscribe(SERVICE_LEVEL, DURATION_WEEKS).accounts({});
  // Guardrail: simulate before sending, and print what we are about to do.
  const simTx = await builder.transaction();
  simTx.feePayer = keypair.publicKey;
  simTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  simTx.sign(keypair);
  const sim = await connection.simulateTransaction(simTx);
  save('subscribe-simulation.json', sim.value);
  console.log('simulate: err =', JSON.stringify(sim.value.err));
  if (sim.value.err) {
    console.log((sim.value.logs ?? []).join('\n'));
    throw new Error('simulation failed; aborting before send');
  }
  console.log(`sending subscribe(serviceLevel=${SERVICE_LEVEL}, weeks=${DURATION_WEEKS}) on DEVNET, fee payer ${keypair.publicKey.toBase58()}`);
  txSig = await builder.rpc();
  save('subscribe-txsig.txt', txSig);
  console.log('subscription tx:', txSig);
  console.log(`explorer: https://explorer.solana.com/tx/${txSig}?cluster=devnet`);
}

// -- 4. activate API token
const tokenPath = join(stateDir, 'api-token.txt');
let apiToken: string;
if (existsSync(tokenPath)) {
  apiToken = readFileSync(tokenPath, 'utf8').trim();
  console.log('reusing API token');
} else {
  const message = `${txSig}:${LEAGUES.join(',')}:${jwt}`;
  const walletSignature = bs58.encode(nacl.sign.detached(Buffer.from(message), keypair.secretKey));
  const res = await fetch(`${API_BASE}/api/token/activate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ txSig, walletSignature, leagues: LEAGUES }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`token/activate ${res.status}: ${body}`);
  apiToken = body.trim();
  save('api-token.txt', apiToken);
  console.log('API token activated:', apiToken.slice(0, 16) + '…');
}

// -- 5. probe data endpoints and dump raw payloads
const get = async (path: string) => {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${jwt}`, 'X-Api-Token': apiToken },
  });
  const text = await res.text();
  console.log(`GET ${path} -> ${res.status} (${text.length} bytes)`);
  return { status: res.status, text };
};

const fixtures = await get('/api/fixtures/snapshot');
save('probe-fixtures-snapshot.json', fixtures.text);
if (fixtures.status === 200) {
  try {
    const list = JSON.parse(fixtures.text) as Array<{ fixtureId?: number; id?: number }>;
    const first = Array.isArray(list) ? list[0] : undefined;
    const fixtureId = first?.fixtureId ?? first?.id;
    console.log('fixtures:', Array.isArray(list) ? list.length : 'non-array', '— probing fixtureId', fixtureId);
    if (fixtureId !== undefined) {
      save('probe-scores-snapshot.json', (await get(`/api/scores/snapshot/${fixtureId}`)).text);
      save('probe-scores-updates.json', (await get(`/api/scores/updates/${fixtureId}`)).text);
      save('probe-stat-validation.json', (await get(`/api/scores/stat-validation?fixtureId=${fixtureId}&seq=1&statKey=1`)).text);
    }
  } catch (err) {
    console.log('fixtures parse failed:', err instanceof Error ? err.message : String(err));
  }
}
console.log('\nstate saved under', stateDir, '(keep outside git; disposable devnet key only)');
