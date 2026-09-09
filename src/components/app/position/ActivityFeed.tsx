'use client';

import type { Address } from 'viem';
import type { PositionState, PositionEvent } from '@/lib/aqua/position';
import type { PositionRecord } from '@/lib/rules/types';
import { usd, shortHash, timeAgo } from '@/lib/format';
import { aUSDC, aUSDbC, ACCENT } from '@/lib/addresses';

const KIND: Record<PositionEvent['kind'], { label: string; color: string }> = {
  ship: { label: 'Shipped to Aqua', color: '#4ade80' },
  'swap-in': { label: 'Swap — received', color: ACCENT },
  'swap-out': { label: 'Swap — paid out', color: '#fbbf24' },
  dock: { label: 'Docked (unwound)', color: '#f87171' },
};

function sym(token?: Address): string {
  if (!token) return '';
  if (token.toLowerCase() === aUSDC.toLowerCase()) return 'aUSDC';
  if (token.toLowerCase() === aUSDbC.toLowerCase()) return 'aUSDbC';
  return shortHash(token);
}

export function ActivityFeed({ pos, record }: { pos: PositionState | null; record: PositionRecord }) {
  const events = pos ? [...pos.activity].reverse() : [];

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-400">
        <span>swaps {pos?.swaps.count ?? '—'}</span>
        <span>pulled ${pos ? usd(pos.swaps.pulled, 4) : '—'}</span>
        <span>pushed ${pos ? usd(pos.swaps.pushed, 4) : '—'}</span>
      </div>

      <ol className="mt-4 space-y-3">
        {events.map((e, i) => {
          const k = KIND[e.kind];
          return (
            <li key={`${e.txHash}-${e.logIndex}-${i}`} className="flex items-baseline gap-3 text-sm">
              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: k.color }} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-neutral-200">{k.label}</span>
                  <span className="font-mono text-[11px] text-neutral-600">block {e.blockNumber.toString()}</span>
                </div>
                {e.amount != null && (
                  <p className="text-xs text-neutral-500">
                    ${usd(e.amount, 4)} {sym(e.token)}
                  </p>
                )}
                <p className="font-mono text-[11px] text-neutral-700">{shortHash(e.txHash)}</p>
              </div>
            </li>
          );
        })}

        <li className="flex items-baseline gap-3 text-sm">
          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-600" />
          <div className="flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-neutral-400">Position opened</span>
              <span className="text-[11px] text-neutral-600">{timeAgo(record.createdAt)}</span>
            </div>
            <p className="font-mono text-[11px] text-neutral-700">deposit block {record.depositBlock.toString()}</p>
          </div>
        </li>
      </ol>

      {record.status === 'unwound' && record.unwindTxHashes?.length ? (
        <p className="mt-4 border-t border-white/10 pt-3 text-xs text-neutral-500">
          Keeper unwind txs: {record.unwindTxHashes.map((h) => shortHash(h)).join(', ')}
          {record.unwoundAt ? ` · ${timeAgo(record.unwoundAt)}` : ''}
        </p>
      ) : null}

      {pos && events.length === 0 && (
        <p className="mt-3 text-xs text-neutral-600">No swaps against this strategy yet.</p>
      )}
    </div>
  );
}
