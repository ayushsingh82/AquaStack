/** client-safe formatting helpers */
import { formatUnits } from 'viem';

/** 6-decimal stable amount → "1,234.56" */
export function usd(v: bigint, dp = 2): string {
  return Number(formatUnits(v, 6)).toLocaleString(undefined, { maximumFractionDigits: dp });
}

/** bps → "+0.36%" / "−1.20%" */
export function bpsPct(bps: number, sign = false): string {
  const pct = bps / 100;
  const s = sign && pct > 0 ? '+' : '';
  return `${s}${pct.toFixed(2)}%`;
}

export function shortHash(h: string): string {
  return `${h.slice(0, 10)}…${h.slice(-4)}`;
}

export function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
