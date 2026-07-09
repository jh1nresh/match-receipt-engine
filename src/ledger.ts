import type { MarketResult, Side } from './types';

export interface Stake {
  staker: string;
  side: Side;
  amount: number;
}

export interface Payout {
  staker: string;
  amount: number;
  kind: 'winnings' | 'refund';
}

// Simulated escrow ledger. Integer amounts only (lamport-style). Pro-rata
// payout with floor division; indivisible dust is reported, never hidden.
export class SimulatedEscrowLedger {
  readonly network = 'simulated' as const;
  private stakes = new Map<string, Stake[]>();
  private closed = new Set<string>();

  fund(marketId: string, stake: Stake): void {
    if (this.closed.has(marketId)) throw new Error(`market ${marketId} already settled`);
    if (!Number.isInteger(stake.amount) || stake.amount <= 0) {
      throw new Error(`stake amount must be a positive integer, got ${stake.amount}`);
    }
    const list = this.stakes.get(marketId) ?? [];
    list.push({ ...stake });
    this.stakes.set(marketId, list);
  }

  escrowed(marketId: string): number {
    return (this.stakes.get(marketId) ?? []).reduce((sum, s) => sum + s.amount, 0);
  }

  settle(marketId: string, result: MarketResult): { payouts: Payout[]; dust: number } {
    const stakes = this.takeOpen(marketId);
    const winningSide: Side = result === 'YES_WINS' ? 'YES' : 'NO';
    const winners = stakes.filter((s) => s.side === winningSide);
    // No one backed the winning side: everyone gets their stake back.
    if (winners.length === 0) {
      return { payouts: stakes.map((s) => ({ staker: s.staker, amount: s.amount, kind: 'refund' as const })), dust: 0 };
    }
    const pot = stakes.reduce((sum, s) => sum + s.amount, 0);
    const winningTotal = winners.reduce((sum, s) => sum + s.amount, 0);
    const payouts = winners.map((s) => ({
      staker: s.staker,
      amount: Math.floor((pot * s.amount) / winningTotal),
      kind: 'winnings' as const,
    }));
    const dust = pot - payouts.reduce((sum, p) => sum + p.amount, 0);
    return { payouts, dust };
  }

  refund(marketId: string): { payouts: Payout[]; dust: number } {
    const stakes = this.takeOpen(marketId);
    return { payouts: stakes.map((s) => ({ staker: s.staker, amount: s.amount, kind: 'refund' as const })), dust: 0 };
  }

  private takeOpen(marketId: string): Stake[] {
    if (this.closed.has(marketId)) throw new Error(`market ${marketId} already settled`);
    this.closed.add(marketId);
    return this.stakes.get(marketId) ?? [];
  }
}
