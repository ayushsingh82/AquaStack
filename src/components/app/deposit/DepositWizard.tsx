'use client';

import { useMemo, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { useAccount, useReadContract } from 'wagmi';
import { USDC, ACCENT } from '@/lib/addresses';
import { ERC20_READ_ABI } from '@/lib/abis';
import { RULE_PRESETS, type Rule, type RulePreset } from '@/lib/rules/types';
import { Button, Card, Label, Option } from '@/components/app/ui';
import { DepositSign } from './DepositSign';

const PEG_BANDS: Record<PegPreset, { pct: number; hint: string }> = {
  tight: { pct: 0.1, hint: 'captures more fee flow, exits sooner on any wobble' },
  balanced: { pct: 0.5, hint: 'the default — room to run, still a real guard' },
  wide: { pct: 2.0, hint: 'rides through noise, only reacts to a real depeg' },
};
type PegPreset = 'tight' | 'balanced' | 'wide';

const STEPS = ['Amount', 'Strategy', 'Rule', 'Review & sign'];

type RuleForm = {
  pegDeviationBps: string;
  takeProfitBps: string;
  stopLossBps: string;
  maxDrawdownBps: string;
  autoUnwind: boolean;
};

const toStr = (v?: number) => (v == null ? '' : String(v));
const fromRule = (r: Rule): RuleForm => ({
  pegDeviationBps: toStr(r.pegDeviationBps),
  takeProfitBps: toStr(r.takeProfitBps),
  stopLossBps: toStr(r.stopLossBps),
  maxDrawdownBps: toStr(r.maxDrawdownBps),
  autoUnwind: r.autoUnwind,
});
const toRule = (f: RuleForm): Rule => {
  const n = (s: string) => (s.trim() === '' ? undefined : Math.max(0, Math.round(Number(s))));
  return {
    pegDeviationBps: n(f.pegDeviationBps),
    takeProfitBps: n(f.takeProfitBps),
    stopLossBps: n(f.stopLossBps),
    maxDrawdownBps: n(f.maxDrawdownBps),
    autoUnwind: f.autoUnwind,
  };
};

export function DepositWizard() {
  const { address, isConnected } = useAccount();
  const [step, setStep] = useState(0);
  const [amount, setAmount] = useState('');
  const [peg, setPeg] = useState<PegPreset>('balanced');
  const [rulePreset, setRulePreset] = useState<RulePreset | 'custom'>('conservative');
  const [ruleForm, setRuleForm] = useState<RuleForm>(() => fromRule(RULE_PRESETS.conservative));

  const { data: rawBalance } = useReadContract({
    address: USDC,
    abi: ERC20_READ_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const balance = rawBalance != null ? Number(formatUnits(rawBalance, 6)) : undefined;

  const amountNum = Number(amount);
  const amountBaseUnits = useMemo(() => {
    try {
      return amount.trim() ? parseUnits(amount, 6) : 0n;
    } catch {
      return 0n;
    }
  }, [amount]);
  const amountValid =
    amountBaseUnits > 0n && (balance == null || amountNum <= balance) && amountNum >= 1;

  const rule = useMemo(() => toRule(ruleForm), [ruleForm]);
  const patchRule = (p: Partial<RuleForm>) => {
    setRulePreset('custom');
    setRuleForm((f) => ({ ...f, ...p }));
  };
  const applyPreset = (name: RulePreset) => {
    setRulePreset(name);
    setRuleForm(fromRule(RULE_PRESETS[name]));
  };

  return (
    <div>
      <p className="text-xs font-semibold tracking-[0.2em]" style={{ color: ACCENT }}>
        NEW DEPOSIT
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Open a position</h1>

      {/* stepper */}
      <div className="mt-8 flex flex-wrap gap-2 text-xs">
        {STEPS.map((s, i) => (
          <span
            key={s}
            className="border px-2.5 py-1"
            style={{
              borderColor: i === step ? ACCENT : 'rgba(255,255,255,0.15)',
              color: i === step ? ACCENT : i < step ? '#fff' : '#737373',
            }}
          >
            {i + 1}. {s}
          </span>
        ))}
      </div>

      <div className="mt-8 max-w-xl">
        {!isConnected && (
          <Card className="mb-6">
            <p className="text-sm text-neutral-400">Connect a wallet (top right) to continue.</p>
            <p className="mt-1 text-xs text-neutral-600">
              Point it at the Base fork RPC, chain 8453.
            </p>
          </Card>
        )}

        {/* ── Step 1: amount ── */}
        {step === 0 && (
          <Card>
            <Label>USDC to deposit</Label>
            <div className="flex items-center border border-white/15 bg-black px-3">
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="1000"
                className="w-full bg-transparent py-3 text-lg text-white outline-none placeholder:text-neutral-700"
              />
              <span className="text-sm text-neutral-500">USDC</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
              <span>
                {balance != null ? `Balance: ${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
              </span>
              {balance != null && (
                <button
                  className="hover:text-white"
                  onClick={() => setAmount(String(Math.floor(balance)))}
                >
                  Max
                </button>
              )}
            </div>
            {amount && !amountValid && (
              <p className="mt-2 text-xs text-red-400">
                {amountNum < 1
                  ? 'Minimum 1 USDC.'
                  : balance != null && amountNum > balance
                    ? 'More than your balance.'
                    : 'Enter a valid amount.'}
              </p>
            )}
            <p className="mt-4 text-xs leading-5 text-neutral-600">
              Half is swapped to USDbC on Aerodrome; both halves are supplied to Aave v3 and
              shipped to Aqua as a pegged aUSDC/aUSDbC position. USDbC liquidity on Base is
              thin — keep the demo deposit small.
            </p>
          </Card>
        )}

        {/* ── Step 2: strategy ── */}
        {step === 1 && (
          <Card>
            <Label>Peg band</Label>
            <div className="grid gap-3 sm:grid-cols-3">
              {(Object.keys(PEG_BANDS) as PegPreset[]).map((k) => (
                <Option
                  key={k}
                  active={peg === k}
                  onClick={() => setPeg(k)}
                  title={`${k[0].toUpperCase()}${k.slice(1)} · ±${PEG_BANDS[k].pct}%`}
                  hint={PEG_BANDS[k].hint}
                />
              ))}
            </div>
            <p className="mt-4 text-xs leading-5 text-neutral-600">
              The pegged AMM concentrates liquidity within ±{PEG_BANDS[peg].pct}% of 1:1. Tighter
              = more fee capture per dollar, but the peg-deviation rule can trip on small moves.
            </p>
          </Card>
        )}

        {/* ── Step 3: rule ── */}
        {step === 2 && (
          <Card>
            <Label>Preset</Label>
            <div className="grid gap-3 sm:grid-cols-3">
              {(['conservative', 'balanced', 'alertOnly'] as RulePreset[]).map((k) => (
                <Option
                  key={k}
                  active={rulePreset === k}
                  onClick={() => applyPreset(k)}
                  title={k === 'alertOnly' ? 'Alert only' : `${k[0].toUpperCase()}${k.slice(1)}`}
                  hint={
                    k === 'conservative'
                      ? 'tight guards, auto-unwind'
                      : k === 'balanced'
                        ? 'looser, auto-unwind'
                        : 'notify only, never auto-exit'
                  }
                />
              ))}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {(
                [
                  ['pegDeviationBps', 'Peg deviation (bps)'],
                  ['takeProfitBps', 'Take profit (bps)'],
                  ['stopLossBps', 'Stop loss (bps)'],
                  ['maxDrawdownBps', 'Max drawdown (bps)'],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <Label>{label}</Label>
                  <input
                    inputMode="numeric"
                    value={ruleForm[key]}
                    onChange={(e) => patchRule({ [key]: e.target.value.replace(/[^0-9]/g, '') })}
                    placeholder="off"
                    className="w-full border border-white/15 bg-black px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-700"
                  />
                </div>
              ))}
            </div>

            <label className="mt-5 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={ruleForm.autoUnwind}
                onChange={(e) => patchRule({ autoUnwind: e.target.checked })}
                className="accent-[var(--accent)]"
                style={{ ['--accent' as string]: ACCENT }}
              />
              <span className="text-neutral-300">
                Auto-unwind when a threshold trips (otherwise the keeper only alerts)
              </span>
            </label>
          </Card>
        )}

        {/* ── Step 4: sign ── */}
        {step === 3 && (
          <DepositSign
            userAmountLabel={`${amount} USDC`}
            amountBaseUnits={amountBaseUnits}
            pegBand={peg}
            pegPct={PEG_BANDS[peg].pct}
            rule={rule}
          />
        )}

        {/* nav */}
        {step < 3 && (
          <div className="mt-6 flex gap-3">
            {step > 0 && (
              <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            )}
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={!isConnected || (step === 0 && !amountValid)}
            >
              Continue
            </Button>
          </div>
        )}
        {step === 3 && (
          <div className="mt-6">
            <Button variant="ghost" onClick={() => setStep(2)}>
              Back
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
