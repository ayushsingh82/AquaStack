'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Hex } from 'viem';
import { useAccount, useChainId, usePublicClient, useSendTransaction, useSwitchChain } from 'wagmi';
import { aUSDC, aUSDbC, AAVE_POOL, USDC, USDbC, ACCENT } from '@/lib/addresses';
import { ERC20_READ_ABI, AAVE_INDEX_ABI } from '@/lib/abis';
import { CHAIN_ID } from '@/lib/chain';
import { fromClient } from '@/lib/serialize';
import { prepareDepositAction, buildShipStepAction, recordDepositAction } from '@/app/app/actions';
import type { Rule } from '@/lib/rules/types';
import { Button, Card } from '@/components/app/ui';

type TxStep = { label: string; to: Hex; data: Hex; value?: bigint };
type Prep = {
  strategyHash: Hex;
  strategyBytes: Hex;
  pegBand: number;
  planned: Record<string, bigint>;
  steps: TxStep[];
  shipStepIndex: number;
};
type Phase = 'idle' | 'running' | 'done' | 'error';

export function DepositSign({
  userAmountLabel,
  amountBaseUnits,
  pegBand,
  pegPct,
  rule,
}: {
  userAmountLabel: string;
  amountBaseUnits: bigint;
  pegBand: string;
  pegPct: number;
  rule: Rule;
}) {
  const router = useRouter();
  const { address } = useAccount();
  const chainId = useChainId();
  const client = usePublicClient();
  const { sendTransactionAsync } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();

  const [phase, setPhase] = useState<Phase>('idle');
  const [note, setNote] = useState('');
  const [steps, setSteps] = useState<string[]>([]);
  const [doneIdx, setDoneIdx] = useState(-1);
  const [error, setError] = useState('');

  const wrongChain = chainId !== CHAIN_ID;

  async function send(step: TxStep): Promise<Hex> {
    const hash = await sendTransactionAsync({
      to: step.to,
      data: step.data,
      value: step.value ?? 0n,
      chainId: CHAIN_ID,
    });
    await client!.waitForTransactionReceipt({ hash });
    return hash;
  }

  async function run() {
    if (!address || !client) return;
    setError('');
    setPhase('running');
    try {
      setNote('Building the plan…');
      const prep = fromClient<Prep>(
        await prepareDepositAction({
          user: address,
          usdcAmount: amountBaseUnits.toString(),
          pegBand: pegBand as 'tight' | 'balanced' | 'wide',
          rule,
        }),
      );
      setSteps([...prep.steps.map((s) => s.label), 'Ship strategy to Aqua', 'Save position']);

      for (let i = 0; i < prep.shipStepIndex; i++) {
        setNote(`Signing: ${prep.steps[i].label}`);
        await send(prep.steps[i]);
        setDoneIdx(i);
      }

      setNote('Reading balances after supply…');
      const [aA, aB, idxA, idxB, block] = await Promise.all([
        client.readContract({ address: aUSDC, abi: ERC20_READ_ABI, functionName: 'balanceOf', args: [address] }),
        client.readContract({ address: aUSDbC, abi: ERC20_READ_ABI, functionName: 'balanceOf', args: [address] }),
        client.readContract({ address: AAVE_POOL, abi: AAVE_INDEX_ABI, functionName: 'getReserveNormalizedIncome', args: [USDC] }),
        client.readContract({ address: AAVE_POOL, abi: AAVE_INDEX_ABI, functionName: 'getReserveNormalizedIncome', args: [USDbC] }),
        client.getBlockNumber(),
      ]);

      const ship = fromClient<{ to: Hex; data: Hex; value: bigint; shipped: bigint }>(
        await buildShipStepAction(prep.strategyBytes, aA.toString(), aB.toString()),
      );
      setNote('Signing: ship to Aqua');
      await send({ label: 'ship', to: ship.to, data: ship.data, value: 0n });
      setDoneIdx(prep.shipStepIndex);

      setNote('Saving position…');
      await recordDepositAction({
        user: address,
        strategyHash: prep.strategyHash,
        strategyBytes: prep.strategyBytes,
        rule,
        shippedPrincipal: ship.shipped.toString(),
        aaveIndexAtShipA: idxA.toString(),
        aaveIndexAtShipB: idxB.toString(),
        depositBlock: block.toString(),
      });
      setDoneIdx(prep.shipStepIndex + 1);
      setPhase('done');
      setNote('Position opened.');
      setTimeout(() => router.push('/app'), 1400);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.split('\n')[0]);
      setPhase('error');
    }
  }

  return (
    <Card>
      <div className="grid gap-2 text-sm">
        <Row k="Deposit" v={userAmountLabel} />
        <Row k="Strategy" v={`aUSDC / aUSDbC · ${pegBand} band (±${pegPct}%)`} />
        <Row
          k="Rule"
          v={ruleSummary(rule)}
        />
      </div>

      {wrongChain && phase === 'idle' && (
        <div className="mt-5 border border-white/15 p-3 text-xs text-neutral-400">
          Wallet is on chain {chainId}. This runs on the Base fork ({CHAIN_ID}).{' '}
          <button
            className="underline hover:text-white"
            onClick={() => switchChainAsync({ chainId: CHAIN_ID }).catch(() => {})}
          >
            Switch
          </button>
        </div>
      )}

      {steps.length > 0 && (
        <ol className="mt-5 space-y-1.5 text-xs">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-2">
              <span
                className="inline-block h-3.5 w-3.5 border text-center text-[9px] leading-[13px]"
                style={{
                  borderColor: i <= doneIdx ? ACCENT : 'rgba(255,255,255,0.2)',
                  color: ACCENT,
                }}
              >
                {i <= doneIdx ? '✓' : ''}
              </span>
              <span className={i <= doneIdx ? 'text-neutral-300' : 'text-neutral-500'}>{s}</span>
            </li>
          ))}
        </ol>
      )}

      {note && <p className="mt-4 text-xs text-neutral-400">{note}</p>}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      <div className="mt-5">
        {phase === 'idle' && (
          <Button onClick={run} disabled={wrongChain}>
            Open position
          </Button>
        )}
        {phase === 'running' && <Button disabled>Signing…</Button>}
        {phase === 'error' && (
          <Button onClick={run} variant="ghost">
            Retry
          </Button>
        )}
        {phase === 'done' && <p className="text-sm text-neutral-300">Redirecting…</p>}
      </div>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-white/10 pb-2">
      <span className="text-neutral-500">{k}</span>
      <span className="text-right text-neutral-200">{v}</span>
    </div>
  );
}

function ruleSummary(r: Rule): string {
  const parts: string[] = [];
  if (r.pegDeviationBps != null) parts.push(`depeg ${r.pegDeviationBps}bps`);
  if (r.takeProfitBps != null) parts.push(`TP +${r.takeProfitBps}bps`);
  if (r.stopLossBps != null) parts.push(`SL −${r.stopLossBps}bps`);
  if (r.maxDrawdownBps != null) parts.push(`DD ${r.maxDrawdownBps}bps`);
  return `${parts.join(' · ') || 'no thresholds'} — ${r.autoUnwind ? 'auto-unwind' : 'alert only'}`;
}
