import type { WireScores, WireScoresStatValidation, WireTokenResponse } from './wire';

export interface TxlineClientConfig {
  // https://txline.txodds.com (mainnet data) or https://txline-dev.txodds.com
  baseUrl?: string;
  jwt?: string;
  // Long-lived API token from POST /api/token/activate. Even the free World
  // Cup tier requires a one-time on-chain subscription + wallet-signed
  // activation to obtain this — see README "Live mode".
  apiToken?: string;
}

const DEFAULT_BASE_URL = 'https://txline.txodds.com';
const REQUEST_TIMEOUT_MS = 15_000;

function assertInt(name: string, value: number): void {
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer, got ${String(value)}`);
}

export class TxlineHttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    body: string,
  ) {
    super(`TxLINE ${status} on ${url}: ${body.slice(0, 200)}`);
    this.name = 'TxlineHttpError';
  }
}

// Verified working without any credentials (2026-07-09): returns a 30-day
// anonymous JWT.
export async function startGuestSession(baseUrl = DEFAULT_BASE_URL): Promise<string> {
  const url = `${baseUrl}/auth/guest/start`;
  const res = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new TxlineHttpError(res.status, url, await res.text());
  const body = (await res.json()) as WireTokenResponse;
  return body.token;
}

export class TxlineClient {
  private readonly baseUrl: string;
  private readonly jwt: string;
  private readonly apiToken?: string;

  constructor(cfg: TxlineClientConfig & { jwt: string }) {
    this.baseUrl = cfg.baseUrl ?? DEFAULT_BASE_URL;
    this.jwt = cfg.jwt;
    this.apiToken = cfg.apiToken;
  }

  scoresSnapshot(fixtureId: number): Promise<WireScores> {
    assertInt('fixtureId', fixtureId);
    return this.get(`/api/scores/snapshot/${fixtureId}`);
  }

  scoresUpdates(fixtureId: number): Promise<WireScores[]> {
    assertInt('fixtureId', fixtureId);
    return this.get(`/api/scores/updates/${fixtureId}`);
  }

  statValidation(params: { fixtureId: number; seq: number; statKey: number; statKey2?: number }): Promise<WireScoresStatValidation> {
    assertInt('fixtureId', params.fixtureId);
    assertInt('seq', params.seq);
    const q = new URLSearchParams({
      fixtureId: String(params.fixtureId),
      seq: String(params.seq),
      statKey: String(params.statKey),
    });
    if (params.statKey2 !== undefined) q.set('statKey2', String(params.statKey2));
    return this.get(`/api/scores/stat-validation?${q}`);
  }

  private async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = { Authorization: `Bearer ${this.jwt}` };
    if (this.apiToken) headers['X-Api-Token'] = this.apiToken;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) throw new TxlineHttpError(res.status, url, await res.text());
    return (await res.json()) as T;
  }
}
