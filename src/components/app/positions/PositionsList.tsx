'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { getPositionsAction } from '@/app/app/actions';
import { fromClient } from '@/lib/serialize';
import type { PositionState } from '@/lib/aqua/position';
import type { EvalResult, PositionRecord } from '@/lib/rules/types';
import { usd, bpsPct, shortHash, timeAgo } from '@/lib/format';
import { ACCENT } from '@/lib/addresses';

type Row = {
  record: PositionRecord;
  pos: PositionState | null;
  result: EvalResult | null;
  error: string | null;
};

const STATUS: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: '#4ade80' },
  alerting: { label: 'Alerting', color: '#fbbf24' },
  unwound: { label: 'Unwound', color: '#737373' },
};

export function PositionsList() {
  const { address, isConnected } = useAccount();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      setRows(fromClient<Row[]>(await getPositionsAction(address)));
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em]" style={{ color: ACCENT }}>
            POSITIONS
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Your positions</h1>
        </div>
        <Link
          href="/app/deposit"
          className="border bg-black px-4 py-2 text-sm font-medium transition-colors hover:bg-white/5"
          style={{ borderColor: ACCENT, color: ACCENT }}
        >
          New deposit
        </Link>
      </div>

      {!isConnected && (
        <div className="mt-10 border border-white/15 bg-[#151515] p-12 text-center text-sm text-neutral-400">
          Connect a wallet to see your positions.
        </div>
      )}

      {isConnected && loading && !rows && (
        <div className="mt-10 border border-white/15 bg-[#151515] p-12 text-center text-sm text-neutral-500">Loading…</div>
      )}

      {isConnected && rows && rows.length === 0 && (
        <div className="mt-10 border border-white/15 bg-[#151515] p-12 text-center">
          <p className="text-sm text-neutral-400">No positions yet.</p>
          <Link
            href="/app/deposit"
            className="mt-4 inline-block border bg-black px-4 py-2 text-sm font-medium transition-colors hover:bg-white/5"
            style={{ borderColor: ACCENT, color: ACCENT }}
          >
            Open your first position
          </Link>
        </div>
      )}

      {isConnected && rows && rows.length > 0 && (
        <div className="mt-8 divide-y divide-white/10 border-y border-white/15">
          {rows.map(({ record, pos, result, error }) => {
            const s = STATUS[record.status] ?? STATUS.active;
            const principal = record.shippedPrincipalA + record.shippedPrincipalB;
            const ret = result?.metrics.totalReturnBps;
            return (
              <Link
                key={record.strategyHash}
                href={`/app/position/${record.strategyHash}`}
                className="flex flex-col gap-3 py-4 transition-colors hover:bg-white/[0.02] sm:flex-row sm:items-center sm:gap-6"
              >
                <span
                  className="w-fit border px-2 py-0.5 text-[11px]"
                  style={{ borderColor: s.color, color: s.color }}
                >
                  {s.label}
                </span>
                <span className="font-mono text-xs text-neutral-500">{shortHash(record.strategyHash)}</span>
                <span className="text-sm text-neutral-300">${usd(principal)} principal</span>
                <span className="text-sm">
                  {ret != null ? (
                    <span style={{ color: ret >= 0 ? '#4ade80' : '#f87171' }}>{bpsPct(ret, true)}</span>
                  ) : (
                    <span className="text-neutral-600">{error ? 'read error' : '—'}</span>
                  )}
                </span>
                <span className="text-xs text-neutral-500">
                  {pos ? `peg ${pos.pegDeviationBps}bps` : ''}
                </span>
                <span className="text-xs text-neutral-600 sm:ml-auto">{timeAgo(record.createdAt)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
