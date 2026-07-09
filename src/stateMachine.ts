import type { MarketState } from './types';

const TRANSITIONS: Record<MarketState, MarketState[]> = {
  created: ['funded_or_simulated', 'refunded'],
  funded_or_simulated: ['awaiting_result', 'refunded'],
  awaiting_result: ['receipt_observed', 'refunded', 'needs_dispute_review'],
  receipt_observed: ['proof_verified_or_simulated', 'needs_dispute_review'],
  proof_verified_or_simulated: ['settled_yes', 'settled_no', 'needs_dispute_review'],
  needs_dispute_review: ['settled_yes', 'settled_no', 'refunded'],
  settled_yes: [],
  settled_no: [],
  refunded: [],
};

export class IllegalTransitionError extends Error {
  constructor(from: MarketState, to: MarketState) {
    super(`illegal transition: ${from} -> ${to}`);
    this.name = 'IllegalTransitionError';
  }
}

export function transition(from: MarketState, to: MarketState): MarketState {
  if (!TRANSITIONS[from].includes(to)) throw new IllegalTransitionError(from, to);
  return to;
}

export function isTerminal(state: MarketState): boolean {
  return TRANSITIONS[state].length === 0;
}
