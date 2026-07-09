// Wire-level types matching the TxLINE OpenAPI spec exactly
// (https://txline.txodds.com/docs/docs.yaml). Integer IDs, epoch-millis
// timestamps, per-period soccer scores, ScoreStat objects. The adapter in
// adapter.ts converts these into the engine's normalized internal types.

export interface WireSoccerScore {
  Goals: number;
  YellowCards: number;
  RedCards: number;
  Corners: number;
}

// Periods observed in the spec: H1, HT, H2, ET1, ET2 (+ possible others).
export type WireSoccerTotalScore = Partial<Record<string, WireSoccerScore>>;

export interface WireScores {
  fixtureId: number;
  gameState: string;
  startTime: number;
  participant1IsHome: boolean;
  participant1Id: number;
  participant2Id: number;
  id: number;
  ts: number;
  seq: number;
  scoreSoccer?: {
    Participant1?: WireSoccerTotalScore;
    Participant2?: WireSoccerTotalScore;
  };
}

export interface WireScoreStat {
  key: number;
  value: number;
  period: number;
}

export interface WireProofNode {
  hash: string; // binary on the wire (base64 in JSON); adapter converts to hex
  isRightSibling: boolean;
}

export interface WireScoresStatValidation {
  ts: number;
  statToProve: WireScoreStat;
  eventStatRoot: string;
  summary: {
    fixtureId: number;
    eventStatsSubTreeRoot: string;
  };
  statProof: WireProofNode[];
  subTreeProof: WireProofNode[];
  mainTreeProof: WireProofNode[];
}

export interface WireTokenResponse {
  token: string;
}
