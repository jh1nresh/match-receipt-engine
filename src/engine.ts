import { SimulatedEscrowLedger, type Payout, type Stake } from './ledger';
import { verifyAnchoredChain, verifyStatProof } from './merkle';
import { buildReceipt } from './receipt';
import { resolveMarket } from './resolver';
import { transition } from './stateMachine';
import type { Market, MarketResult, SettlementReceipt, TimelineEvent } from './types';
import type { RootAnchor, TxlineScoreUpdate, TxlineStatValidation } from './txline/types';

export interface SettlementOutcome {
  market: Market;
  receipt: SettlementReceipt | null;
  payouts: Payout[];
  dust: number;
  timeline: TimelineEvent[];
}

// Orchestrates one market through the full lifecycle. Every state change is
// appended to the timeline so a judge can inspect why funds moved.
export class SettlementEngine {
  readonly ledger = new SimulatedEscrowLedger();
  readonly timeline: TimelineEvent[] = [];
  private market: Market;
  private finalUpdate: TxlineScoreUpdate | null = null;
  private validation: TxlineStatValidation | null = null;
  private anchor: RootAnchor | null = null;

  constructor(marketDef: Omit<Market, 'state'>) {
    this.market = { ...marketDef, state: 'created' };
    this.record('market created');
  }

  get state() {
    return this.market.state;
  }

  fund(stakes: Stake[], at?: string): void {
    for (const stake of stakes) this.ledger.fund(this.market.marketId, stake);
    this.move('funded_or_simulated', `escrowed ${this.ledger.escrowed(this.market.marketId)} (${this.ledger.network})`, at);
    this.move('awaiting_result', 'waiting for TxLINE final result', at);
  }

  // Non-final updates are recorded but do not change state.
  observe(update: TxlineScoreUpdate): void {
    if (update.fixtureId !== this.market.fixtureId) return;
    // Real feeds re-emit final state; anything after the first FINISHED is
    // ignored so a duplicate can never hit an illegal transition.
    if (this.finalUpdate) {
      this.record(`ignored update after final result (seq ${update.seq})`, update.ts);
      return;
    }
    if (update.gameState !== 'FINISHED') {
      this.record(
        `observed ${update.gameState} ${update.scoreSoccer.participant1}-${update.scoreSoccer.participant2} (seq ${update.seq})`,
        update.ts,
      );
      return;
    }
    this.finalUpdate = update;
    this.move(
      'receipt_observed',
      `final result ${update.scoreSoccer.participant1}-${update.scoreSoccer.participant2} (seq ${update.seq})`,
      update.ts,
    );
  }

  // Verify the TxLINE proof. With an anchor, the full three-level chain must
  // hold (stat -> event root -> fixture sub-tree -> daily root); without one,
  // only the stat proof is checked. Any failure routes to dispute review,
  // never to silent settlement.
  attachProof(validation: TxlineStatValidation, anchor?: RootAnchor): boolean {
    if (!this.finalUpdate) throw new Error('no final result observed yet');
    this.validation = validation;
    this.anchor = anchor ?? null;
    if (anchor) {
      const chain = verifyAnchoredChain(validation, anchor.dailyRoot);
      if (chain.fullyAnchored) {
        this.move(
          'proof_verified_or_simulated',
          `full chain verified: stat -> eventStatRoot -> sub-tree -> daily root ${anchor.dailyRoot.slice(0, 12)}… (${anchor.source})`,
          validation.ts,
        );
        return true;
      }
      this.move(
        'needs_dispute_review',
        `proof chain FAILED (stat:${chain.statOk} subTree:${chain.subTreeOk} mainTree:${chain.mainTreeOk}); settlement blocked`,
        validation.ts,
      );
      return false;
    }
    const ok = verifyStatProof(validation);
    if (ok) {
      this.move('proof_verified_or_simulated', `stat proof verified against eventStatRoot ${validation.eventStatRoot.slice(0, 12)}… (unanchored)`, validation.ts);
    } else {
      this.move('needs_dispute_review', 'stat proof FAILED verification; settlement blocked', validation.ts);
    }
    return ok;
  }

  settle(sourceEndpoint: string): SettlementOutcome {
    if (this.market.state === 'needs_dispute_review') {
      const { payouts, dust } = this.ledger.refund(this.market.marketId);
      this.move('refunded', 'dispute resolved by refund: all stakes returned');
      return { market: this.market, receipt: null, payouts, dust, timeline: this.timeline };
    }
    if (!this.finalUpdate || !this.validation) throw new Error('cannot settle without final result and proof');
    const result: MarketResult = resolveMarket(this.market, this.finalUpdate);
    const receipt = buildReceipt({
      market: this.market,
      finalUpdate: this.finalUpdate,
      validation: this.validation,
      proofVerified: true,
      result,
      sourceEndpoint,
      anchor: this.anchor,
    });
    const { payouts, dust } = this.ledger.settle(this.market.marketId, result);
    this.move(
      result === 'YES_WINS' ? 'settled_yes' : 'settled_no',
      `deterministic rule "${this.market.condition}" -> ${result}; ${payouts.length} payout(s)`,
      this.finalUpdate.ts,
    );
    return { market: this.market, receipt, payouts, dust, timeline: this.timeline };
  }

  private move(to: Market['state'], detail: string, at?: string): void {
    this.market.state = transition(this.market.state, to);
    this.timeline.push({ at: at ?? 'replay', state: this.market.state, detail });
  }

  private record(detail: string, at?: string): void {
    this.timeline.push({ at: at ?? 'replay', state: this.market.state, detail });
  }
}
