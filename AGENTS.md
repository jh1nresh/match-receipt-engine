# AGENTS.md

Proof-gated settlement demo for the Superteam World Cup Hackathon
(Prediction Markets and Settlement track). Deadline: 2026-07-19 23:59 UTC.

## Commands

- `npm run check` — typecheck + full test suite (the objective gate; must pass before commit)
- `npm run dev` — web demo on :3000
- `npm run replay` — CLI lifecycle trail
- `npx tsx scripts/make-fixture.ts` — regenerate the Merkle-consistent fixture

## Structure

- `src/` — pure settlement engine (no framework deps): merkle, resolver,
  stateMachine, ledger, receipt, engine, replay
- `src/txline/` — TxLINE integration: `wire.ts` (OpenAPI-exact types),
  `client.ts` (live HTTP), `adapter.ts` (wire → internal), `types.ts` (internal)
- `app/` — Next.js demo UI + `/api/replay` JSON endpoint
- `specs/spec.md` — canonical spec; brain mirror at
  `~/brain/wiki/projects/match-receipt-engine/spec.md` (dual-write on change)

## Rules

- Settlement must stay deterministic: no model calls, no clock, no randomness
  in the resolve path.
- A failed proof can only reach `needs_dispute_review` → refund. Never let a
  code path settle on unverified data.
- Network honesty: every user-visible surface labels `simulated` / `devnet`
  truthfully. No mainnet, no real-money language.
- Unknown TxLINE `gameState` values must never map to FINISHED.
- Engine (`src/`, minus `demo.ts`) must not import from `app/` or Next.js.
