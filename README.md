# Match Receipt Settlement Engine

A proof-gated settlement engine where live World Cup events become verifiable
receipts that deterministically resolve escrowed prediction markets.

Built for the Superteam World Cup Hackathon — **Prediction Markets and
Settlement** track (TxLINE by TxODDS as primary data source).

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
npm run check     # typecheck + 24 tests
npm run replay    # full lifecycle demo from fixtures/wc-final-replay.json
```

`npm run replay` prints the inspectable trail: timeline, receipt, and payouts —
the judge-facing answer to "why did funds move?"

Regenerate the fixture (rebuilds the Merkle tree): `npx tsx scripts/make-fixture.ts`

## TxLINE endpoints used

| Purpose | Endpoint |
|---|---|
| Final score / live updates | `GET /api/scores/snapshot/{fixtureId}`, `GET /api/scores/updates/{fixtureId}` |
| Stat proof for settlement | `GET /api/scores/stat-validation` |
| Fixture metadata | `GET /api/fixtures/snapshot` |

v0 replays fixture data shaped after these schemas; live guest-JWT ingest is
the next milestone (World Cup data is fee-waived through the submission
deadline).

## Roadmap to submission

1. ✅ Deterministic engine: resolver + state machine + receipt + Merkle verify + simulated escrow (this repo)
2. ⬜ TxLINE live client (guest JWT session, free World Cup tier)
3. ⬜ Web UI: market card, receipt/proof inspector, settlement timeline
4. ⬜ Solana devnet escrow program (only after 1–3 are solid; simulated stays the honest fallback)
5. ⬜ Public deploy + 5-minute demo video + technical docs

## Honesty boundary

- `network` is `simulated` everywhere until a devnet program exists; devnet
  transactions will be labeled devnet and linked to the explorer.
- No wallet connection is required for the demo.
- Failed proof verification always blocks settlement (`needs_dispute_review`),
  and dispute review can only end in refund or explicit settlement.
