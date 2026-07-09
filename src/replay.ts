import { SettlementEngine, type SettlementOutcome } from './engine';
import type { ReplayFixture } from './types';

// Demo mode (F5): drive the full lifecycle from a recorded fixture so the
// demo works even when no live match is happening.
export function runReplay(fixture: ReplayFixture): SettlementOutcome {
  const engine = new SettlementEngine(fixture.market);
  engine.fund(fixture.stakes);
  for (const update of fixture.updates) engine.observe(update);
  engine.attachProof(fixture.validation);
  return engine.settle(fixture.sourceEndpoint);
}
