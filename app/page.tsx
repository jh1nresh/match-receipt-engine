import Link from 'next/link';
import { getDemoFixture, runDemo } from '@/src/demo';
import { verifyAnchoredChain } from '@/src/merkle';
import type { MarketState } from '@/src/types';

function stateTone(state: MarketState): string {
  if (state === 'settled_yes' || state === 'proof_verified_or_simulated') return 'text-emerald-400 border-emerald-400/40';
  if (state === 'needs_dispute_review' || state === 'refunded') return 'text-red-400 border-red-400/40';
  if (state === 'settled_no') return 'text-neutral-100 border-neutral-500';
  return 'text-neutral-400 border-neutral-700';
}

function StateChip({ state }: { state: MarketState }) {
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs ${stateTone(state)}`}>{state}</span>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase text-neutral-500">{title}</h2>
      {children}
    </section>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<{ tamper?: string }> }) {
  const tamper = (await searchParams).tamper === '1';
  const fixture = getDemoFixture();
  const outcome = runDemo(tamper);
  const { market, receipt, payouts, dust, timeline } = outcome;
  const totalStaked = fixture.stakes.reduce((s, x) => s + x.amount, 0);
  const validation = tamper
    ? { ...fixture.validation, statToProve: fixture.validation.statToProve.replace('2-1', '9-0') }
    : fixture.validation;
  const chain = verifyAnchoredChain(validation, fixture.anchoring?.dailyRoot);
  const chainMark = (ok: boolean | null) => (ok === null ? '–' : ok ? '✓' : '✗');

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded border border-amber-400/40 px-2 py-0.5 text-xs text-amber-400">NETWORK: SIMULATED</span>
          <span className="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400">no real money · no wagering · demo only</span>
        </div>
        <h1 className="text-balance text-2xl font-bold text-neutral-50">Match Receipt Settlement Engine</h1>
        <p className="mt-1 max-w-3xl text-pretty text-sm text-neutral-400">
          TxLINE World Cup events become verifiable receipts that deterministically resolve escrowed prediction
          markets. Funds move only after a Merkle proof passes a visible rule — inspect the full trail below.
        </p>
        <nav className="mt-4 flex gap-2">
          <Link
            href="/"
            className={`rounded border px-3 py-1.5 text-sm ${!tamper ? 'border-emerald-400/60 text-emerald-400' : 'border-neutral-700 text-neutral-400 hover:text-neutral-200'}`}
          >
            Verified replay
          </Link>
          <Link
            href="/?tamper=1"
            className={`rounded border px-3 py-1.5 text-sm ${tamper ? 'border-red-400/60 text-red-400' : 'border-neutral-700 text-neutral-400 hover:text-neutral-200'}`}
          >
            Tampered-proof replay
          </Link>
          <a
            href={`/api/replay${tamper ? '?tamper=1' : ''}`}
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200"
          >
            Raw JSON
          </a>
        </nav>
        {tamper ? (
          <p className="mt-3 text-pretty text-sm text-red-400">
            This run feeds the engine a stat that does not match the TxLINE Merkle root. Watch it fail verification:
            settlement is blocked and every stake is refunded.
          </p>
        ) : null}
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="TxLINE match feed (replayed)">
          <p className="mb-2 text-sm text-neutral-300">{fixture.description}</p>
          <ul className="space-y-1 text-sm tabular-nums">
            {fixture.updates.map((u) => (
              <li key={u.seq} className="flex items-center justify-between gap-2 border-b border-neutral-800/60 pb-1 last:border-0">
                <span className="truncate text-neutral-500">{u.ts}</span>
                <span className="text-neutral-300">
                  {u.scoreSoccer.participant1}–{u.scoreSoccer.participant2}
                </span>
                <span className={u.gameState === 'FINISHED' ? 'text-emerald-400' : 'text-neutral-500'}>{u.gameState}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-neutral-600">source: {fixture.sourceEndpoint}</p>
        </Panel>

        <Panel title="Market">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-neutral-500">market</dt>
              <dd className="text-neutral-200">{market.marketId}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-neutral-500">rule (deterministic)</dt>
              <dd className="text-right text-neutral-200">{market.condition}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-neutral-500">escrowed (simulated)</dt>
              <dd className="tabular-nums text-neutral-200">{totalStaked}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-neutral-500">state</dt>
              <dd>
                <StateChip state={market.state} />
              </dd>
            </div>
          </dl>
          <h3 className="mb-1 mt-4 text-xs uppercase text-neutral-600">stakes</h3>
          <ul className="space-y-1 text-sm tabular-nums">
            {fixture.stakes.map((s) => (
              <li key={s.staker} className="flex justify-between gap-2">
                <span className="text-neutral-400">{s.staker}</span>
                <span className="text-neutral-500">{s.side}</span>
                <span className="text-neutral-200">{s.amount}</span>
              </li>
            ))}
          </ul>
          <h3 className="mb-1 mt-4 text-xs uppercase text-neutral-600">payouts</h3>
          {payouts.length === 0 ? (
            <p className="text-sm text-neutral-500">none</p>
          ) : (
            <ul className="space-y-1 text-sm tabular-nums">
              {payouts.map((p) => (
                <li key={`${p.staker}-${p.kind}`} className="flex justify-between gap-2">
                  <span className="text-neutral-400">{p.staker}</span>
                  <span className={p.kind === 'winnings' ? 'text-emerald-400' : 'text-red-400'}>{p.kind}</span>
                  <span className="text-neutral-200">{p.amount}</span>
                </li>
              ))}
            </ul>
          )}
          {dust > 0 ? <p className="mt-1 text-xs text-neutral-500">indivisible dust retained in ledger: {dust}</p> : null}
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title="Settlement timeline — why funds moved">
          <ol className="space-y-2 text-sm">
            {timeline.map((e, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-2">
                <span className="w-44 shrink-0 tabular-nums text-neutral-600">{e.at}</span>
                <StateChip state={e.state} />
                <span className="text-pretty text-neutral-300">{e.detail}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Panel title="Settlement receipt">
          {receipt ? (
            <pre className="overflow-x-auto text-xs leading-5 text-neutral-300">{JSON.stringify(receipt, null, 2)}</pre>
          ) : (
            <div className="text-sm">
              <p className="text-red-400">No receipt issued: proof verification failed.</p>
              <p className="mt-1 text-pretty text-neutral-400">
                A settlement receipt is only produced when the observed stat verifies against the TxLINE event-stat
                Merkle root. This run was refunded instead —{' '}
                <Link href="/" className="text-emerald-400 underline">
                  run the verified replay
                </Link>{' '}
                to see one.
              </p>
            </div>
          )}
        </Panel>

        <Panel title="Merkle proof inspector">
          <dl className="space-y-1.5 text-sm">
            <div>
              <dt className="text-neutral-500">stat to prove</dt>
              <dd className="break-all text-neutral-200">{validation.statToProve}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">event stat root (TxLINE)</dt>
              <dd className="break-all tabular-nums text-neutral-200">{validation.eventStatRoot}</dd>
            </div>
            {validation.summary ? (
              <div>
                <dt className="text-neutral-500">fixture sub-tree root</dt>
                <dd className="break-all tabular-nums text-neutral-200">{validation.summary.eventStatsSubTreeRoot}</dd>
              </div>
            ) : null}
            {fixture.anchoring ? (
              <div>
                <dt className="text-neutral-500">daily root anchor ({fixture.anchoring.source})</dt>
                <dd className="break-all tabular-nums text-neutral-200">{fixture.anchoring.dailyRoot}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-neutral-500">proof chain</dt>
              <dd className={chain.fullyAnchored ? 'text-emerald-400' : 'text-red-400'}>
                stat {chainMark(chain.statOk)} · sub-tree {chainMark(chain.subTreeOk)} · daily root {chainMark(chain.mainTreeOk)}
                {chain.fullyAnchored ? ' — fully anchored' : ' — settlement blocked'}
              </dd>
            </div>
          </dl>
          <h3 className="mb-1 mt-4 text-xs uppercase text-neutral-600">proof path</h3>
          <ul className="space-y-1 text-xs tabular-nums">
            {fixture.validation.statProof.map((n, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 text-neutral-600">{n.isRightSibling ? 'R' : 'L'}</span>
                <span className="break-all text-neutral-400">{n.hash}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <footer className="mt-8 border-t border-neutral-800 pt-4 text-xs text-neutral-600">
        <p className="text-pretty">
          Escrow is a simulated ledger — no real funds, no mainnet, no wallet required. Data shapes follow the TxLINE
          OpenAPI spec; this demo replays a recorded fixture so it works even when no match is live. Superteam World
          Cup Hackathon — Prediction Markets &amp; Settlement track.
        </p>
      </footer>
    </main>
  );
}
