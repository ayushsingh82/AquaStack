'use client';

import { useMemo, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { useAccount, useReadContract } from 'wagmi';
import { USDC, USDbC, ACCENT } from '@/lib/addresses';
import { ERC20_READ_ABI } from '@/lib/abis';
import { CHAIN_ID } from '@/lib/chain';
import { RULE_PRESETS, type RulePreset } from '@/lib/rules/types';
import { fromRule, toRule, type RuleForm, RULE_FIELDS } from '@/lib/rule-form';
import { getTestTokensAction } from '@/app/app/actions';
import { fromClient } from '@/lib/serialize';
import { Button, Card, Label, Option } from '@/components/app/ui';
import { useToast } from '@/components/app/Toast';
import { DepositSign } from './DepositSign';

const LEG_B_SYMBOL = CHAIN_ID === 84532 ? 'USDT' : 'USDbC';

const PEG_BANDS: Record<PegPreset, { pct: number; hint: string }> = {
  tight: { pct: 0.1, hint: 'captures more fee flow, exits sooner on any wobble' },
  balanced: { pct: 0.5, hint: 'the default — room to run, still a real guard' },
  wide: { pct: 2.0, hint: 'rides through noise, only reacts to a real depeg' },
};
type PegPreset = 'tight' | 'balanced' | 'wide';

const STEPS = ['Amount', 'Strategy', 'Rule', 'Review & sign'];

export function DepositWizard() {
  const { address, isConnected } = useAccount();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [amount, setAmount] = useState('');
  const [peg, setPeg] = useState<PegPreset>('balanced');
  const [rulePreset, setRulePreset] = useState<RulePreset | 'custom'>('conservative');
  const [ruleForm, setRuleForm] = useState<RuleForm>(() => fromRule(RULE_PRESETS.conservative));
  const [fauceting, setFauceting] = useState(false);

  const { data: rawUsdc, refetch: refetchUsdc } = useReadContract({
    address: USDC, abi: ERC20_READ_ABI, functionName: 'balanceOf',
    args: address ? [address] : undefined, query: { enabled: !!address },
  });
  const { data: rawLegB, refetch: refetchLegB } = useReadContract({
    address: USDbC, abi: ERC20_READ_ABI, functionName: 'balanceOf',
    args: address ? [address] : undefined, query: { enabled: !!address },
  });
  const usdcBal = rawUsdc != null ? Number(formatUnits(rawUsdc, 6)) : undefined;
  const legBBal = rawLegB != null ? Number(formatUnits(rawLegB, 6)) : undefined;
  const balance = usdcBal; // leg-A drives the Max button

  const amountNum = Number(amount);
  const amountBaseUnits = useMemo(() => {
    try {
      return amount.trim() ? parseUnits(amount, 6) : 0n;
    } catch {
      return 0n;
    }
  }, [amount]);
  // deposit is symmetric: `amount` of USDC AND `amount` of leg B
  const enough = (b?: number) => b == null || amountNum <= b;
  const amountValid =
    amountBaseUnits > 0n && amountNum >= 1 && enough(usdcBal) && enough(legBBal);

  async function getTestTokens() {
    if (!address) return;
    setFauceting(true);
    try {
      fromClient(await getTestTokensAction(address));
      await Promise.all([refetchUsdc(), refetchLegB()]);
      toast('success', `Minted test USDC + ${LEG_B_SYMBOL} to your wallet.`);
    } catch (e) {
      toast('error', `Faucet failed: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
    } finally {
      setFauceting(false);
    }
  }

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
              Point it at chain {CHAIN_ID}.
            </p>
          </Card>
        )}

        {/* ── Step 1: amount ── */}
        {step === 0 && (
          <Card>
            <Label>Amount per leg</Label>
            <div className="flex items-center border border-white/15 bg-black px-3">
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="1000"
                className="w-full bg-transparent py-3 text-lg text-white outline-none placeholder:text-neutral-700"
              />
              <span className="text-sm text-neutral-500">USDC + {LEG_B_SYMBOL}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-6 text-xs text-neutral-500">
              <span>USDC: {usdcBal != null ? usdcBal.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}</span>
              <span className="flex items-center justify-between">
                <span>{LEG_B_SYMBOL}: {legBBal != null ? legBBal.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}</span>
                {balance != null && (
                  <button className="hover:text-white" onClick={() => setAmount(String(Math.floor(Math.min(usdcBal ?? 0, legBBal ?? 0))))}>
                    Max
                  </button>
                )}
              </span>
            </div>
            {amount && !amountValid && (
              <p className="mt-2 text-xs text-red-400">
                {amountNum < 1 ? 'Minimum 1 per leg.' : `Not enough ${!enough(usdcBal) ? 'USDC' : LEG_B_SYMBOL} — use the faucet.`}
              </p>
            )}

            <button
              onClick={getTestTokens}
              disabled={!isConnected || fauceting}
              className="mt-4 border border-white/20 px-3 py-2 text-xs text-white transition-colors hover:border-white/40 disabled:opacity-40"
            >
              {fauceting ? 'Minting…' : `Get test USDC + ${LEG_B_SYMBOL}`}
            </button>

            <p className="mt-4 text-xs leading-5 text-neutral-600">
              Both legs are supplied to Aave v3 and shipped to 1inch Aqua as a pegged
              aUSDC/a{LEG_B_SYMBOL} position — one balance earning Aave APY and the Aqua spread.
              Keep the demo deposit small.
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
              {RULE_FIELDS.map(([key, label]) => (
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
            userAmountLabel={`${amount} USDC + ${amount} ${LEG_B_SYMBOL}`}
            usdcBaseUnits={amountBaseUnits}
            usdbcBaseUnits={amountBaseUnits}
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
