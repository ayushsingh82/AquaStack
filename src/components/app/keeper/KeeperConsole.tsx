'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getKeeperVerdictsAction,
  getKeeperLogAction,
  getKeeperStatusAction,
  runKeeperAction,
} from '@/app/app/actions';
import { fromClient } from '@/lib/serialize';
import type { PositionState } from '@/lib/aqua/position';
import type { EvalResult, PositionRecord } from '@/lib/rules/types';
import type { TickResult, KeeperRun } from '@/lib/keeper/types';
import { bpsPct, shortHash, timeAgo } from '@/lib/format';
import { describeReason } from '@/lib/rule-form';
import { ACCENT } from '@/lib/addresses';
import { Button } from '@/components/app/ui';
import { useToast } from '@/components/app/Toast';

type Verdict = {
  record: PositionRecord;
  pos: PositionState | null;
  result: EvalResult | null;
  error: string | null;
};
type SignerInfo = { kind: 'local-key' | 'none'; address?: string };

const ACTION: Record<string, string> = {
  hold: '#4ade80',
  alert: '#fbbf24',
  unwind: '#f87171',
  unwound: '#f87171',
  noop: '#737373',
  error: '#f87171',
};

export function KeeperConsole() {
  const toast = useToast();
  const [verdicts, setVerdicts] = useState<Verdict[] | null>(null);
  const [runs, setRuns] = useState<KeeperRun[] | null>(null);
  const [signer, setSigner] = useState<SignerInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [v, l, s] = await Promise.all([
        getKeeperVerdictsAction(),
        getKeeperLogAction(),
        getKeeperStatusAction(),
      ]);
      setVerdicts(fromClient<Verdict[]>(v));
      setRuns(fromClient<KeeperRun[]>(l));
      setSigner(fromClient<SignerInfo>(s));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run() {
    setRunning(true);
    try {
      const results = fromClient<TickResult[]>(await runKeeperAction());
      const unwound = results.filter((r) => r.action === 'unwound').length;
      const alerts = results.filter((r) => r.action === 'alert').length;
      toast(
        unwound ? 'error' : alerts ? 'info' : 'success',
        results.length === 0
          ? 'Keeper ran — no positions to tick.'
          : `Keeper ticked ${results.length}: ${results.filter((r) => r.action === 'hold').length} hold · ${alerts} alert · ${unwound} unwound.`,
      );
      await load();
    } catch (e) {
      toast('error', `Keeper run failed: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em]" style={{ color: ACCENT }}>
            KEEPER
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Keeper console</h1>
          <p className="mt-1 text-xs text-neutral-600">
            One pass over every <span className="text-neutral-400">active</span> and{' '}
            <span className="text-neutral-400">alerting</span> position: read state → evaluate the rule →
            hold, alert, or unwind via the session signer.
          </p>
        </div>
        <Button onClick={run} disabled={running}>
          {running ? 'Running…' : 'Run keeper now'}
        </Button>
      </div>

      {/* ── Signer status (task 22) ── */}
      <div className="mt-5 border border-white/15 px-4 py-3 text-xs">
        {signer == null ? (
          <span className="text-neutral-600">Checking keeper signer…</span>
        ) : signer.kind === 'local-key' ? (
          <span className="text-neutral-400">
            Keeper signer:{' '}
            <span className="font-mono text-neutral-200">{shortHash(signer.address ?? '')}</span> — local
            demo key (<span className="text-neutral-500">KEEPER_PRIVATE_KEY</span>). Auto-unwind is armed.
          </span>
        ) : (
          <span style={{ color: '#fbbf24' }}>
            No keeper signer attached — runs can alert but not auto-unwind. Set{' '}
            <span className="font-mono">KEEPER_PRIVATE_KEY</span> for the demo keeper, or wire a Privy
            session signer scoped to <span className="font-mono">dock()</span> +{' '}
            <span className="font-mono">withdraw()</span> in{' '}
            <span className="font-mono">keeper-signer.ts</span>.
          </span>
        )}
      </div>

      {/* ── Verdict table (task 20) ── */}
      <div className="mt-8">
        <p className="text-xs font-semibold tracking-[0.18em]" style={{ color: ACCENT }}>
          CURRENT VERDICTS
        </p>

        {loading && !verdicts && <p className="mt-4 text-sm text-neutral-500">Reading positions…</p>}
        {verdicts && verdicts.length === 0 && (
          <p className="mt-4 text-sm text-neutral-500">No positions are being watched.</p>
        )}

        {verdicts && verdicts.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-neutral-600">
                <tr className="border-b border-white/15">
                  <th className="py-2 pr-4 font-normal">Position</th>
                  <th className="py-2 pr-4 font-normal">Status</th>
                  <th className="py-2 pr-4 font-normal">Return</th>
                  <th className="py-2 pr-4 font-normal">Peg dev</th>
                  <th className="py-2 pr-4 font-normal">Verdict</th>
                  <th className="py-2 font-normal">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {verdicts.map(({ record, pos, result, error: rowError }) => {
                  const ret = result?.metrics.totalReturnBps;
                  const action = result?.action ?? (rowError ? 'error' : '—');
                  return (
                    <tr key={record.strategyHash}>
                      <td className="py-2.5 pr-4">
                        <Link
                          href={`/app/position/${record.strategyHash}`}
                          className="font-mono text-xs text-neutral-400 hover:text-white"
                        >
                          {shortHash(record.strategyHash)}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-neutral-400">{record.status}</td>
                      <td className="py-2.5 pr-4">
                        {ret != null ? (
                          <span style={{ color: ret >= 0 ? '#4ade80' : '#f87171' }}>{bpsPct(ret, true)}</span>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-neutral-300">
                        {pos ? `${pos.pegDeviationBps} bps` : '—'}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span style={{ color: ACTION[action] ?? '#a3a3a3' }}>{action}</span>
                      </td>
                      <td className="py-2.5 text-xs text-neutral-400">
                        {rowError
                          ? rowError.split('\n')[0]
                          : result && result.reasons.length > 0
                            ? result.reasons.map(describeReason).join('; ')
                            : result?.action === 'hold'
                              ? 'within limits'
                              : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs text-neutral-600">
          Verdicts are a dry-run evaluation and never write. “Run keeper now” is the pass that acts —
          persisting the drawdown peak, flipping status to <span className="text-neutral-400">alerting</span>,
          or sending the unwind txs.
        </p>
      </div>

      {/* ── Activity log (task 21) ── */}
      <div className="mt-10">
        <p className="text-xs font-semibold tracking-[0.18em]" style={{ color: ACCENT }}>
          RUN HISTORY
        </p>

        {runs && runs.length === 0 && (
          <p className="mt-4 text-sm text-neutral-500">No keeper runs yet.</p>
        )}

        {runs && runs.length > 0 && (
          <ol className="mt-4 space-y-4">
            {runs.map((r) => (
              <li key={r.at} className="border-l border-white/15 pl-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-sm text-neutral-300">
                    {r.ticked === 0 ? 'No positions ticked' : `Ticked ${r.ticked} position${r.ticked > 1 ? 's' : ''}`}
                  </span>
                  <span className="text-[11px] text-neutral-600">{timeAgo(r.at)}</span>
                </div>
                {r.results.length > 0 && (
                  <ul className="mt-1.5 space-y-1 text-xs">
                    {r.results.map((t) => (
                      <li key={t.strategyHash} className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-mono text-neutral-600">{shortHash(t.strategyHash)}</span>
                        <span style={{ color: ACTION[t.action] ?? '#fff' }}>{t.action}</span>
                        <span className="text-neutral-500">{t.detail}</span>
                        {t.txHashes && t.txHashes.length > 0 && (
                          <span className="font-mono text-neutral-700">
                            {t.txHashes.map((h) => shortHash(h)).join(', ')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
