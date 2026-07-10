import { Connection, PublicKey } from '@solana/web3.js';

// On-chain root anchoring against the TxODDS Txoracle program.
// Program IDs from https://txline.txodds.com/documentation/programs/addresses
// DailyScoresMerkleRoots PDA: seed "daily_scores_roots" + epochDay (u16 LE),
// entries { epochDay u16, hourOfDay u8, minuteOfHour u8, root [32] } inserted
// per batch via insertScoresRoot.

export type Cluster = 'mainnet' | 'devnet';

export const TXORACLE_PROGRAM_IDS: Record<Cluster, string> = {
  mainnet: '9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA',
  devnet: '6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J',
};

export const DEFAULT_RPC: Record<Cluster, string> = {
  mainnet: 'https://api.mainnet-beta.solana.com',
  devnet: 'https://api.devnet.solana.com',
};

export function epochDayFromTs(tsMs: number): number {
  const day = Math.floor(tsMs / 86_400_000);
  if (day < 0 || day > 0xffff) throw new Error(`epochDay ${day} out of u16 range`);
  return day;
}

export function deriveDailyScoresRootsPda(epochDay: number, cluster: Cluster): PublicKey {
  const seed = Buffer.alloc(2);
  seed.writeUInt16LE(epochDay);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('daily_scores_roots'), seed],
    new PublicKey(TXORACLE_PROGRAM_IDS[cluster]),
  );
  return pda;
}

export interface DailyRootEntry {
  epochDay: number;
  // Two bytes between epochDay and root. Docs describe them as hour/minute,
  // but live accounts show values like 165/66 (out of clock range), so the
  // semantic is unverified — exposed raw as a u16 LE until the IDL confirms.
  slotMeta: number;
  rootHex: string;
}

export interface DailyScoresRootsAccount {
  address: string;
  cluster: Cluster;
  epochDay: number;
  entries: DailyRootEntry[];
  rawBase64: string;
}

// Layout (validated against live mainnet/devnet accounts 2026-07-09, 9232
// bytes = 8-byte Anchor discriminator + 256 slots × 36-byte records
// { u16 epochDay, u8 hour, u8 minute, [32] root }): unused slots are
// zero-filled, so scan every slot and keep the ones matching the PDA's
// epoch day. Raw data is preserved so a layout drift stays inspectable.
export function parseDailyScoresRoots(data: Buffer, epochDay: number): DailyRootEntry[] {
  const entries: DailyRootEntry[] = [];
  for (let offset = 8; offset + 36 <= data.length; offset += 36) {
    const day = data.readUInt16LE(offset);
    if (day !== epochDay) continue;
    entries.push({
      epochDay: day,
      slotMeta: data.readUInt16LE(offset + 2),
      rootHex: data.subarray(offset + 4, offset + 36).toString('hex'),
    });
  }
  return entries;
}

export async function fetchDailyScoresRoots(
  epochDay: number,
  cluster: Cluster,
  rpcUrl = DEFAULT_RPC[cluster],
): Promise<DailyScoresRootsAccount | null> {
  const connection = new Connection(rpcUrl, 'confirmed');
  const pda = deriveDailyScoresRootsPda(epochDay, cluster);
  const info = await connection.getAccountInfo(pda);
  if (!info) return null;
  return {
    address: pda.toBase58(),
    cluster,
    epochDay,
    entries: parseDailyScoresRoots(info.data, epochDay),
    rawBase64: info.data.toString('base64'),
  };
}
