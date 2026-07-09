import fixtureJson from '../fixtures/wc-final-replay.json';
import { runReplay } from './replay';
import type { SettlementOutcome } from './engine';
import type { ReplayFixture } from './types';

const baseFixture = fixtureJson as unknown as ReplayFixture;

// Demo entry shared by the page and the JSON API. `tamper` corrupts the
// observed stat before verification to demonstrate that a bad proof can only
// end in dispute review -> refund, never settlement.
export function getDemoFixture(): ReplayFixture {
  return baseFixture;
}

export function runDemo(tamper: boolean): SettlementOutcome {
  const fixture: ReplayFixture = tamper
    ? {
        ...baseFixture,
        validation: {
          ...baseFixture.validation,
          statToProve: baseFixture.validation.statToProve.replace('2-1', '9-0'),
        },
      }
    : baseFixture;
  return runReplay(fixture);
}
