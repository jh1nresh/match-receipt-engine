import { createHash } from 'node:crypto';
import type { ProofNode, TxlineStatValidation } from './txline/types.js';

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

function hashPair(leftHex: string, rightHex: string): string {
  return sha256Hex(Buffer.concat([Buffer.from(leftHex, 'hex'), Buffer.from(rightHex, 'hex')]));
}

export function foldProof(leafHex: string, nodes: ProofNode[]): string {
  let acc = leafHex;
  for (const node of nodes) {
    acc = node.isRightSibling ? hashPair(acc, node.hash) : hashPair(node.hash, acc);
  }
  return acc;
}

// Deterministic check: leaf = sha256(statToProve), fold statProof, compare root.
export function verifyStatProof(validation: TxlineStatValidation): boolean {
  const leaf = sha256Hex(validation.statToProve);
  return foldProof(leaf, validation.statProof) === validation.eventStatRoot;
}

// Fixture/test helper: build a real Merkle tree over stat strings and return
// the proof for one leaf. Odd layers duplicate the last node.
export function buildStatProof(stats: string[], index: number): { eventStatRoot: string; statProof: ProofNode[] } {
  if (index < 0 || index >= stats.length) throw new Error(`index ${index} out of range`);
  let layer = stats.map((s) => sha256Hex(s));
  let pos = index;
  const proof: ProofNode[] = [];
  while (layer.length > 1) {
    if (layer.length % 2 === 1) layer.push(layer[layer.length - 1]!);
    const siblingPos = pos % 2 === 0 ? pos + 1 : pos - 1;
    proof.push({ hash: layer[siblingPos]!, isRightSibling: siblingPos > pos });
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      next.push(hashPair(layer[i]!, layer[i + 1]!));
    }
    layer = next;
    pos = Math.floor(pos / 2);
  }
  return { eventStatRoot: layer[0]!, statProof: proof };
}
