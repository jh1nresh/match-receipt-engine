# Spec — Match Receipt Settlement Engine (Superteam World Cup Hackathon)

> Source brief: `~/brain/raw/inbox/2026-07-09-superteam-world-cup-match-receipt-settlement-engine.md`
> Brain mirror: `~/brain/wiki/projects/match-receipt-engine/spec.md`
> Track: Prediction Markets and Settlement (TxODDS TxLINE) — 18,000 USDT pool
> Deadline: 2026-07-19 23:59 UTC

## Product boundary

One sentence: TxLINE World Cup events become verifiable receipts that
deterministically resolve escrowed prediction markets, with an inspectable
proof trail.

Not: betting product, AMM, sportsbook, odds dashboard, wallet-first product,
mainnet funds, custody.

## PM Gate decisions (2026-07-09)

| Question | Decision | Why |
|---|---|---|
| Repo | New narrow repo `match-receipt-engine` | Keeps Maiat/Dojo scope clean; clean public submission |
| Solana mode v0 | Simulated escrow + proof-ready interface | Spec's own rule: don't let program complexity block the demo; devnet is milestone 4 |
| Market type | `TEAM_WIN` (draw → NO) | Single comparator, fully deterministic, easy to explain in 60s |
| TxLINE access | Replay fixtures first, live guest-JWT client second | Free World Cup tier confirmed; fixtures unblock day 1 and satisfy demo mode (F5) |
| Deploy target | Vercel (P2, with web UI) | Standard stack fit |
| Stack | TypeScript, zero runtime deps, vitest | Engine is pure logic; UI added later |

## P1 slice (this repo, done)

Independently testable slice: deterministic engine that takes TxLINE-shaped
score updates + stat-validation proof and produces settlement + receipt +
payouts, replayable from fixtures.

Acceptance (verified by `npm run check`, 24 tests):

- Merkle stat proof verifies; tampered stat/root fails and blocks settlement.
- Resolver is pure and deterministic; draw → NO; non-final result refused.
- State machine enforces the 9-state lifecycle; illegal transitions throw.
- Ledger pays pro-rata with explicit dust; refund-all when winning side empty;
  no double settlement.
- Replay fixture settles YES end-to-end with a `verified`, `simulated`-labeled
  receipt and reproducible `proofHash`.
- Tampered fixture ends `refunded` with all stakes returned.

## P2 (live client + UI — done 2026-07-09)

1. ✅ TxLINE wire types (`src/txline/wire.ts`, OpenAPI-exact), live client
   (`client.ts`; guest JWT verified working against production), adapter
   (`adapter.ts`: int→string IDs, epoch→ISO, per-period goal totalling,
   base64→hex proofs, conservative gameState mapping). 9 adapter tests.
2. ✅ Web UI (Next.js 15 + Tailwind 4): match feed, market card with stakes +
   payouts, settlement timeline, receipt + Merkle proof inspector, honesty
   banner, `/?tamper=1` adversarial demo, `GET /api/replay` JSON endpoint.
   Verified in browser (desktop + mobile, zero console errors).

Known constraints discovered:
- Free World Cup tier still requires one-time on-chain subscription +
  wallet-signed `POST /api/token/activate` for `X-Api-Token` (guest JWT alone
  → 403 on data endpoints). Live wiring is env-var gated, replay is default.
- TxLINE leaf encoding for `ScoreStat` is undocumented → live proofs shown
  but not independently re-verifiable yet (submission feedback item).

## P3 (next)

1. Devnet escrow program with receipt/proof reference field + settle/refund
   instructions; UI links devnet txs to the explorer. Go/no-go by 2026-07-15.
2. Demo package: Vercel deploy, 5-min video, technical docs, TxLINE feedback.
3. Optional: complete free-tier token activation with a disposable wallet to
   light up live mode.

## Security / compliance receipt (v0)

- No mainnet funds; no custody; ledger is simulated and labeled simulated.
- No betting/wagering language in product copy; framed as settlement infra.
- No private keys requested or stored; no wallet connection needed for demo.
- Proof verification failure can never settle funds (state machine enforced).
- Superteam submission, wallet signing, fund movement: blocked without
  explicit action-time confirmation.

## Failure taxonomy → test mapping

| Failure | Covered by |
|---|---|
| F3 opaque/model-driven settlement | resolver tests (pure, deterministic) |
| F4 proof not inspectable | timeline test + receipt fields + replay CLI |
| F5 no replay mode | replay end-to-end tests + `npm run replay` |
| F6 misleading escrow claims | `network: simulated` asserted in receipt test; dust explicit |
| F1/F2/F9 | P2 (live ingest, UI, docs) |
