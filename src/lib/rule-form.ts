/**
 * Client-safe helpers for editing a Rule as a form of string inputs.
 * Shared by the deposit wizard (step 3) and the position rule editor (task 17).
 */
import type { Rule, TriggerReason } from './rules/types';

export type RuleForm = {
  pegDeviationBps: string;
  takeProfitBps: string;
  stopLossBps: string;
  maxDrawdownBps: string;
  autoUnwind: boolean;
};

export const RULE_FIELDS = [
  ['pegDeviationBps', 'Peg deviation (bps)'],
  ['takeProfitBps', 'Take profit (bps)'],
  ['stopLossBps', 'Stop loss (bps)'],
  ['maxDrawdownBps', 'Max drawdown (bps)'],
] as const;

const toStr = (v?: number) => (v == null ? '' : String(v));

export const fromRule = (r: Rule): RuleForm => ({
  pegDeviationBps: toStr(r.pegDeviationBps),
  takeProfitBps: toStr(r.takeProfitBps),
  stopLossBps: toStr(r.stopLossBps),
  maxDrawdownBps: toStr(r.maxDrawdownBps),
  autoUnwind: r.autoUnwind,
});

export const toRule = (f: RuleForm): Rule => {
  const n = (s: string) => (s.trim() === '' ? undefined : Math.max(0, Math.round(Number(s))));
  return {
    pegDeviationBps: n(f.pegDeviationBps),
    takeProfitBps: n(f.takeProfitBps),
    stopLossBps: n(f.stopLossBps),
    maxDrawdownBps: n(f.maxDrawdownBps),
    autoUnwind: f.autoUnwind,
  };
};

/** short human text for one fired trigger, for verdict tables / activity rows */
export function describeReason(r: TriggerReason): string {
  switch (r.kind) {
    case 'depeg':
      return `peg deviated ${r.pegDeviationBps}bps (limit ${r.limitBps})`;
    case 'take-profit':
      return `return ${r.returnBps}bps hit take-profit ${r.targetBps}`;
    case 'stop-loss':
      return `return ${r.returnBps}bps hit stop-loss −${r.limitBps}`;
    case 'max-drawdown':
      return `drawdown ${r.drawdownBps}bps hit limit ${r.limitBps}`;
  }
}

/** one-line summary, e.g. "depeg 30bps · SL −50bps — auto-unwind" */
export function ruleSummary(r: Rule): string {
  const parts: string[] = [];
  if (r.pegDeviationBps != null) parts.push(`depeg ${r.pegDeviationBps}bps`);
  if (r.takeProfitBps != null) parts.push(`TP +${r.takeProfitBps}bps`);
  if (r.stopLossBps != null) parts.push(`SL −${r.stopLossBps}bps`);
  if (r.maxDrawdownBps != null) parts.push(`DD ${r.maxDrawdownBps}bps`);
  return `${parts.join(' · ') || 'no thresholds'} — ${r.autoUnwind ? 'auto-unwind' : 'alert only'}`;
}
