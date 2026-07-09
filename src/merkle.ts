import { createHash } from 'node:crypto';
import type { ProofNode, TxlineStatValidation } from './txline/types';

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

// Full three-level chain per the TxODDS oracle hierarchy:
// stat -> eventStatRoot -> fixture sub-tree root -> daily root (on-chain).
// Level linkage encoding is our documented assumption pending the published
// IDL / a live payload; each level is reported separately so a mismatch is
// diagnosable, and any failure blocks settlement.
export interface ChainVerification {
  statOk: boolean;
  subTreeOk: boolean | null;
  mainTreeOk: boolean | null;
  fullyAnchored: boolean;
}

export function verifyAnchoredChain(validation: TxlineStatValidation, dailyRoot?: string): ChainVerification {
  const statOk = verifyStatProof(validation);
  const subTreeOk = validation.summary
    ? foldProof(validation.eventStatRoot, validation.subTreeProof) === validation.summary.eventStatsSubTreeRoot
    : null;
  const mainTreeOk =
    validation.summary && dailyRoot
      ? foldProof(validation.summary.eventStatsSubTreeRoot, validation.mainTreeProof) === dailyRoot
      : null;
  return { statOk, subTreeOk, mainTreeOk, fullyAnchored: statOk && subTreeOk === true && mainTreeOk === true };
}

// Fixture/test helper: build a Merkle tree over pre-hashed leaves and return
// the proof for one leaf. Odd layers duplicate the last node.
export function buildProofFromLeafHashes(leafHashes: string[], index: number): { root: string; proof: ProofNode[] } {
  if (index < 0 || index >= leafHashes.length) throw new Error(`index ${index} out of range`);
  let layer = [...leafHashes];
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
  return { root: layer[0]!, proof };
}

export function buildStatProof(stats: string[], index: number): { eventStatRoot: string; statProof: ProofNode[] } {
  const { root, proof } = buildProofFromLeafHashes(stats.map((s) => sha256Hex(s)), index);
  return { eventStatRoot: root, statProof: proof };
}
