'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getKeeperVerdictsAction, runKeeperAction } from '@/app/app/actions';
import { fromClient } from '@/lib/serialize';
import type { PositionState } from '@/lib/aqua/position';
import type { EvalResult, PositionRecord } from '@/lib/rules/types';
import type { TickResult } from '@/lib/keeper/types';
import { bpsPct, shortHash } from '@/lib/format';
import { describeReason } from '@/lib/rule-form';
import { ACCENT } from '@/lib/addresses';
import { Button, Card } from '@/components/app/ui';

type Verdict = {
  record: PositionRecord;
  pos: PositionState | null;
  result: EvalResult | null;
  error: string | null;
};

const ACTION: Record<string, string> = {
  hold: '#4ade80',
  alert: '#fbbf24',
  unwind: '#f87171',
  unwound: '#f87171',
  noop: '#737373',
  error: '#f87171',
};

export function KeeperConsole() {
  const [verdicts, setVerdicts] = useState<Verdict[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResults, setRunResults] = useState<TickResult[] | null>(null);
  const [ranAt, setRanAt] = useState<string>('');
  const [error, setError] = useState('');

  const loadVerdicts = useCallback(async () => {
    setLoading(true);
    try {
      setVerdicts(fromClient<Verdict[]>(await getKeeperVerdictsAction()));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVerdicts();
  }, [loadVerdicts]);

  async function run() {
    setRunning(true);
    setError('');
    try {
      const results = fromClient<TickResult[]>(await runKeeperAction());
      setRunResults(results);
      setRanAt(new Date().toLocaleTimeString());
      await loadVerdicts();
    } catch (e) {
      setError((e instanceof Error ? e.message : String(e)).split('\n')[0]);
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

      {error && <p className="mt-4 text-xs text-red-400">{error}</p>}

      {/* ── Run output (task 19) ── */}
      {runResults && (
        <Card className="mt-6">
          <p className="text-xs font-semibold tracking-[0.18em]" style={{ color: ACCENT }}>
            LAST RUN {ranAt && `· ${ranAt}`}
          </p>
          {runResults.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">No positions to tick.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {runResults.map((r) => (
                <li key={r.strategyHash} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-xs text-neutral-500">{shortHash(r.strategyHash)}</span>
                  <span style={{ color: ACTION[r.action] ?? '#fff' }}>{r.action}</span>
                  <span className="text-neutral-400">{r.detail}</span>
                  {r.txHashes && r.txHashes.length > 0 && (
                    <span className="font-mono text-[11px] text-neutral-600">
                      {r.txHashes.map((h) => shortHash(h)).join(', ')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* ── Verdict table (task 20) ── */}
      <div className="mt-8">
        <p className="text-xs font-semibold tracking-[0.18em]" style={{ color: ACCENT }}>
          CURRENT VERDICTS
        </p>

        {loading && !verdicts && (
          <p className="mt-4 text-sm text-neutral-500">Reading positions…</p>
        )}

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
    </div>
  );
}
