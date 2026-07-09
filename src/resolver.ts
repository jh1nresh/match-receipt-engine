import type { Market, MarketResult } from './types.js';
import type { TxlineScoreUpdate } from './txline/types.js';

// Pure deterministic resolver. Same inputs always produce the same result;
// no model, no heuristics, no clock.
export function resolveMarket(market: Market, finalUpdate: TxlineScoreUpdate): MarketResult {
  if (market.fixtureId !== finalUpdate.fixtureId) {
    throw new Error(`fixture mismatch: market ${market.fixtureId}, update ${finalUpdate.fixtureId}`);
  }
  if (finalUpdate.gameState !== 'FINISHED') {
    throw new Error(`cannot resolve on gameState ${finalUpdate.gameState}; final result required`);
  }
  const { participant1Id, participant2Id, scoreSoccer } = finalUpdate;
  let teamGoals: number;
  let opponentGoals: number;
  if (market.teamId === participant1Id) {
    teamGoals = scoreSoccer.participant1;
    opponentGoals = scoreSoccer.participant2;
  } else if (market.teamId === participant2Id) {
    teamGoals = scoreSoccer.participant2;
    opponentGoals = scoreSoccer.participant1;
  } else {
    throw new Error(`market team ${market.teamId} not in fixture ${finalUpdate.fixtureId}`);
  }
  // TEAM_WIN rule: strict win only; a draw resolves NO.
  return teamGoals > opponentGoals ? 'YES_WINS' : 'NO_WINS';
}
