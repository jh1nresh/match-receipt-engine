# Match Receipt Settlement Engine

A proof-gated settlement engine where live World Cup events become verifiable
receipts that deterministically resolve escrowed prediction markets.

Built for the Superteam World Cup Hackathon — **Prediction Markets and
Settlement** track (TxLINE by TxODDS as primary data source).

**Live demo:** https://match-receipt-engine.vercel.app
([tamper demo](https://match-receipt-engine.vercel.app/?tamper=1) ·
[raw JSON](https://match-receipt-engine.vercel.app/api/replay))

```text
live event → verifiable receipt → deterministic settlement → payout / refund / dispute → inspectable proof trail
```

This is **not** a betting product. No real money, no mainnet funds, no custody,
no wagering. The default network is `simulated`; every receipt and UI surface
labels the network honestly. It is a public demo of proof-gated settlement
infrastructure: funds (simulated) move only after an externally verifiable
proof passes a deterministic rule.

## What works today (v0 engine)

- **TxLINE-shaped ingest**: score updates typed after the TxLINE OpenAPI
  `Scores` schema (`fixtureId`, `seq`, `participant1Id`, `scoreSoccer`,
  `gameState`), replayable from fixtures so the demo never depends on a live
  match (demo mode).
- **Merkle proof verification**: `ScoresStatValidation`-shaped proofs
  (`statToProve`, `eventStatRoot`, `statProof` of `{hash, isRightSibling}`
  nodes) are verified by recomputing the root. A tampered stat or root fails
  verification and routes to dispute review — it can never settle.
- **Deterministic resolver**: one market type (`TEAM_WIN`; draw resolves NO).
  Pure function, no model, no clock.
- **Settlement state machine**: `created → funded_or_simulated →
  awaiting_result → receipt_observed → proof_verified_or_simulated →
  settled_yes | settled_no`, with `refunded` and `needs_dispute_review`
  branches. Illegal transitions throw.
- **Simulated escrow ledger**: integer amounts, pro-rata payouts, explicit
  dust accounting, refund-all when the winning side is empty, double-settle
  protection.
- **Settlement receipt**: reproducible `proofHash` over canonical JSON, TxLINE
  proof reference, honest `network` and `status` fields.

## Quickstart

```bash
npm install
npm run check     # typecheck + 33 tests
npm run dev       # web demo at http://localhost:3000
npm run replay    # same lifecycle as a CLI trail
```

The web demo shows the four judge-facing panels: TxLINE match feed, market
card (stakes, state, payouts), settlement timeline ("why funds moved"), and
the receipt + Merkle proof inspector. `/?tamper=1` runs the adversarial demo:
a stat that does not match the TxLINE root fails verification, settlement is
blocked, and every stake is refunded. `GET /api/replay?tamper=1` serves the
same outcome as raw JSON.

Regenerate the fixture (rebuilds the Merkle tree): `npx tsx scripts/make-fixture.ts`

## TxLINE endpoints used

| Purpose | Endpoint |
|---|---|
| Final score / live updates | `GET /api/scores/snapshot/{fixtureId}`, `GET /api/scores/updates/{fixtureId}` |
| Stat proof for settlement | `GET /api/scores/stat-validation` |
| Fixture metadata | `GET /api/fixtures/snapshot` |

The demo replays fixture data shaped after these schemas (wire types in
`src/txline/wire.ts` follow the OpenAPI spec exactly: integer IDs,
epoch-millis timestamps, per-period soccer scores, base64 proof hashes).

## Live mode

`src/txline/client.ts` implements the live path: `startGuestSession()` is
verified working (anonymous 30-day JWT, no credentials). Data endpoints
additionally require an `X-Api-Token`, which even the free World Cup tier
only issues after a one-time on-chain subscription (Service Level 1/12, no
payment) plus wallet-signed activation via `POST /api/token/activate`. Once
you have a token:

```bash
TXLINE_API_TOKEN=... # then wire TxlineClient into the feed instead of fixtures
```

`src/txline/adapter.ts` normalizes wire payloads (gameState mapping is
conservative: unknown states are never treated as final). Known gap: TxLINE's
on-chain leaf encoding for `ScoreStat` is not documented, so live proofs are
displayed but cannot be independently re-verified yet — fixture proofs use
our own encoding and verify fully. This is a TxLINE API feedback item for the
submission.

## Roadmap to submission

1. ✅ Deterministic engine: resolver + state machine + receipt + Merkle verify + simulated escrow
2. ✅ TxLINE wire types + live client + adapter (guest JWT verified; API token activation documented above)
3. ✅ Web UI: match feed, market card, receipt/proof inspector, settlement timeline, tamper demo
4. ✅ Public deploy: https://match-receipt-engine.vercel.app
5. ⬜ Devnet escrow + TxLINE root anchoring — see [#2](https://github.com/JhiNResH/match-receipt-engine/issues/2) (go decision, lands by 07-15 or simulated stays)
6. ⬜ 5-minute demo video + submission docs + TxLINE API feedback

## Honesty boundary

- `network` is `simulated` everywhere until a devnet program exists; devnet
  transactions will be labeled devnet and linked to the explorer.
- No wallet connection is required for the demo.
- Failed proof verification always blocks settlement (`needs_dispute_review`),
  and dispute review can only end in refund or explicit settlement.
