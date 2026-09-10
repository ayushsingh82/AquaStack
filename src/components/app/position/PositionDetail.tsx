'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Hex } from 'viem';
import { useAccount } from 'wagmi';
import { getPositionAction } from '@/app/app/actions';
import { fromClient } from '@/lib/serialize';
import type { LegState, PositionState } from '@/lib/aqua/position';
import type { EvalResult, PositionRecord } from '@/lib/rules/types';
import { usd, bpsPct, shortHash, timeAgo } from '@/lib/format';
import { aUSDC, ACCENT } from '@/lib/addresses';
import { Card } from '@/components/app/ui';
import { ActivityFeed } from './ActivityFeed';
import { RuleEditor } from './RuleEditor';
import { UnwindNow } from './UnwindNow';

type Data =
  | { notFound: true }
  | { record: PositionRecord; pos: PositionState | null; result: EvalResult | null; error?: string };

const STATUS: Record<string, string> = { active: '#4ade80', alerting: '#fbbf24', unwound: '#737373' };

export function PositionDetail({ hash }: { hash: Hex }) {
  const { address, isConnected } = useAccount();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      setData(fromClient<Data>(await getPositionAction(address, hash)));
    } finally {
      setLoading(false);
    }
  }, [address, hash]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isConnected) return <Empty>Connect a wallet to view this position.</Empty>;
  if (loading && !data) return <Empty>Loading…</Empty>;
  if (!data) return null;
  if ('notFound' in data) return <Empty>Position not found for this wallet.</Empty>;

  const { record, pos, result, error } = data;
  const principal = record.shippedPrincipalA + record.shippedPrincipalB;

  return (
    <div>
      <Link href="/app" className="text-xs text-neutral-500 hover:text-white">
        ← Positions
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span
          className="border px-2 py-0.5 text-[11px]"
          style={{ borderColor: STATUS[record.status], color: STATUS[record.status] }}
        >
          {record.status[0].toUpperCase() + record.status.slice(1)}
        </span>
        <h1 className="font-mono text-lg">{shortHash(record.strategyHash)}</h1>
        <span className="text-xs text-neutral-600">opened {timeAgo(record.createdAt)}</span>
      </div>

      {error && (
        <p className="mt-3 text-xs text-amber-400">
          Couldn&apos;t read on-chain state — is the Base fork running? ({error.split('\n')[0]})
        </p>
      )}

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        {/* ── Balances (task 13) ── */}
        <Card>
          <PanelTitle>Balances</PanelTitle>
          {pos ? (
            <div className="mt-4 space-y-4">
              <LegRow leg={pos.legA} />
              <LegRow leg={pos.legB} />
              <div className="border-t border-white/10 pt-3 text-xs text-neutral-500">
                Aqua tracks a fixed <span className="text-neutral-300">virtual</span> balance; the
                aToken keeps rebasing in your wallet — that gap is the Aave yield.
              </div>
            </div>
          ) : (
            <Skeleton />
          )}
        </Card>

        {/* ── Yield (task 14) ── */}
        <Card>
          <PanelTitle>Yield</PanelTitle>
          {pos && result ? (
            <div className="mt-4 space-y-3 text-sm">
              <Stat k="Aave interest (both legs)" v={`$${usd(pos.aaveYieldTotal, 4)}`} />
              <Stat
                k="Aqua PnL (spread − drift)"
                v={`${pos.aquaPnl >= 0n ? '+' : '−'}$${usd(pos.aquaPnl < 0n ? -pos.aquaPnl : pos.aquaPnl, 4)}`}
              />
              <div className="border-t border-white/10 pt-3">
                <Stat
                  k="Total return"
                  v={
                    <span style={{ color: result.metrics.totalReturnBps >= 0 ? '#4ade80' : '#f87171' }}>
                      {bpsPct(result.metrics.totalReturnBps, true)} · {result.metrics.totalReturnBps.toFixed(1)} bps
                    </span>
                  }
                />
                <p className="mt-1 text-xs text-neutral-600">on ${usd(principal)} principal</p>
              </div>
            </div>
          ) : (
            <Skeleton />
          )}
        </Card>

        {/* ── Peg (task 15) ── */}
        <Card className="lg:col-span-2">
          <PanelTitle>Peg & rule</PanelTitle>
          {pos ? (
            <div className="mt-4">
              <PegGauge current={pos.pegDeviationBps} limit={record.rule.pegDeviationBps} />
              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-neutral-400">
                <span>quote a→b {pos.quote.aToB.toFixed(5)}</span>
                <span>quote b→a {pos.quote.bToA.toFixed(5)}</span>
                <span>swaps {pos.swaps.count}</span>
              </div>
              <div className="mt-4 border-t border-white/10 pt-4">
                <RuleEditor record={record} onSaved={load} />
              </div>
              {result && result.action !== 'hold' && (
                <p
                  className="mt-3 text-sm"
                  style={{ color: result.action === 'unwind' ? '#f87171' : '#fbbf24' }}
                >
                  Rule tripped — keeper action: <strong>{result.action}</strong>
                  {result.reasons.length > 0 &&
                    ` (${result.reasons.map((r) => r.kind).join(', ')})`}
                </p>
              )}
            </div>
          ) : (
            <Skeleton />
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* ── Activity (task 16) ── */}
        <Card>
          <PanelTitle>Activity</PanelTitle>
          <ActivityFeed pos={pos} record={record} />
        </Card>

        {/* ── Unwind now (task 18) ── */}
        <Card>
          <PanelTitle>Unwind</PanelTitle>
          <div className="mt-4">
            <UnwindNow record={record} onDone={load} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function LegRow({ leg }: { leg: LegState }) {
  const sym = leg.aToken.toLowerCase() === aUSDC.toLowerCase() ? 'aUSDC' : 'aUSDbC';
  const yieldAmt = leg.walletBalance > leg.virtualBalance ? leg.walletBalance - leg.virtualBalance : 0n;
  return (
    <div className="text-sm">
      <div className="flex items-baseline justify-between">
        <span className="font-medium text-white">{sym}</span>
        <span className="text-neutral-400">${usd(leg.walletBalance, 4)} in wallet</span>
      </div>
      <div className="mt-1 flex justify-between text-xs text-neutral-500">
        <span>virtual (Aqua) ${usd(leg.virtualBalance)}</span>
        <span>shipped ${usd(leg.shippedPrincipal)}</span>
      </div>
      <div className="mt-0.5 text-xs" style={{ color: ACCENT }}>
        + ${usd(yieldAmt, 4)} accrued
      </div>
    </div>
  );
}

function PegGauge({ current, limit }: { current: number; limit?: number }) {
  const max = Math.max(50, (limit ?? 0) * 1.6, current * 1.3);
  const curPct = Math.min(100, (current / max) * 100);
  const limPct = limit != null ? Math.min(100, (limit / max) * 100) : null;
  const over = limit != null && current >= limit;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-neutral-400">Peg deviation</span>
        <span style={{ color: over ? '#f87171' : '#fff' }}>{current} bps</span>
      </div>
      <div className="relative mt-2 h-2 w-full bg-white/10">
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: `${curPct}%`, background: over ? '#f87171' : ACCENT }}
        />
        {limPct != null && (
          <div className="absolute inset-y-[-3px] w-px bg-white/70" style={{ left: `${limPct}%` }} />
        )}
      </div>
      {limit != null && (
        <p className="mt-1 text-xs text-neutral-500">exit at {limit} bps (marker)</p>
      )}
    </div>
  );
}

const PanelTitle = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs font-semibold tracking-[0.18em]" style={{ color: ACCENT }}>
    {String(children).toUpperCase()}
  </p>
);
const Stat = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex items-baseline justify-between gap-4">
    <span className="text-neutral-500">{k}</span>
    <span className="text-right text-neutral-200">{v}</span>
  </div>
);
const Skeleton = () => <div className="mt-4 h-24 animate-pulse bg-white/5" />;
const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="border border-white/15 bg-[#151515] p-12 text-center text-sm text-neutral-400">{children}</div>
);
