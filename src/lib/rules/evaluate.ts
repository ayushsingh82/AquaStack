/**
 * Phase 2, piece 3 — the evaluator.
 *
 * Pure function, no chain calls: takes the PositionState that `readPosition()`
 * already produced plus the Rule, and decides hold / alert / unwind.
 *
 * "Total return" = Aave yield (both legs) + Aqua PnL (peg spread minus inventory
 * drift), as bps of the shipped principal. Peg deviation comes straight from the
 * live quote probe in PositionState.
 */
import type { PositionState } from '../aqua/position';
import type { Rule, EvalContext, EvalResult, TriggerReason } from './types';

export function evaluate(pos: PositionState, rule: Rule, ctx: EvalContext = {}): EvalResult {
  const principal = pos.legA.shippedPrincipal + pos.legB.shippedPrincipal;
  const aaveYield = pos.aaveYieldTotal;
  const aquaPnl = pos.aquaPnl;
  const totalValue = aaveYield + aquaPnl;

  const totalReturnBps = principal > 0n ? (Number(totalValue) / Number(principal)) * 10_000 : 0;
  const pegDeviationBps = pos.pegDeviationBps;

  const peakReturnBps = Math.max(ctx.peakReturnBps ?? totalReturnBps, totalReturnBps);
  const drawdownBps = Math.max(0, peakReturnBps - totalReturnBps);

  const metrics = { principal, aaveYield, aquaPnl, totalReturnBps, pegDeviationBps, drawdownBps };
  const nextContext: EvalContext = { peakReturnBps };

  // nothing to act on if the position isn't live
  if (pos.status !== 'active') {
    return { triggered: false, reasons: [], action: 'hold', metrics, nextContext };
  }

  const reasons: TriggerReason[] = [];
  if (rule.pegDeviationBps != null && pegDeviationBps >= rule.pegDeviationBps) {
    reasons.push({ kind: 'depeg', pegDeviationBps, limitBps: rule.pegDeviationBps });
  }
  if (rule.takeProfitBps != null && totalReturnBps >= rule.takeProfitBps) {
    reasons.push({ kind: 'take-profit', returnBps: round(totalReturnBps), targetBps: rule.takeProfitBps });
  }
  if (rule.stopLossBps != null && totalReturnBps <= -rule.stopLossBps) {
    reasons.push({ kind: 'stop-loss', returnBps: round(totalReturnBps), limitBps: rule.stopLossBps });
  }
  if (rule.maxDrawdownBps != null && drawdownBps >= rule.maxDrawdownBps) {
    reasons.push({ kind: 'max-drawdown', drawdownBps: round(drawdownBps), limitBps: rule.maxDrawdownBps });
  }

  const triggered = reasons.length > 0;
  const action: EvalResult['action'] = !triggered ? 'hold' : rule.autoUnwind ? 'unwind' : 'alert';

  return { triggered, reasons, action, metrics, nextContext };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** one-line explanation of why an evaluation triggered, for logs / notifications */
export function describeReasons(reasons: TriggerReason[]): string {
  return reasons
    .map((r) => {
      switch (r.kind) {
        case 'depeg': return `peg deviated ${r.pegDeviationBps}bps (limit ${r.limitBps})`;
        case 'take-profit': return `return ${r.returnBps}bps hit take-profit ${r.targetBps}`;
        case 'stop-loss': return `return ${r.returnBps}bps hit stop-loss −${r.limitBps}`;
        case 'max-drawdown': return `drawdown ${r.drawdownBps}bps hit limit ${r.limitBps}`;
      }
    })
    .join('; ');
}
