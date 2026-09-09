'use client';

import { useState } from 'react';
import type { Hex } from 'viem';
import { useAccount, useChainId, usePublicClient, useSendTransaction, useSwitchChain } from 'wagmi';
import { prepareUnwindAction, markUnwoundAction } from '@/app/app/actions';
import { fromClient } from '@/lib/serialize';
import { CHAIN_ID } from '@/lib/chain';
import type { PositionRecord } from '@/lib/rules/types';
import type { TxStep } from '@/lib/aqua/types';
import { shortHash } from '@/lib/format';
import { ACCENT } from '@/lib/addresses';
import { Button } from '@/components/app/ui';
import { useToast } from '@/components/app/Toast';

type Plan = { steps: TxStep[]; alreadyDocked: boolean; status: string };
type Phase = 'idle' | 'confirm' | 'running' | 'done' | 'error';

export function UnwindNow({ record, onDone }: { record: PositionRecord; onDone: () => void }) {
  const { address } = useAccount();
  const toast = useToast();
  const chainId = useChainId();
  const client = usePublicClient();
  const { sendTransactionAsync } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();

  const [phase, setPhase] = useState<Phase>('idle');
  const [withdraw, setWithdraw] = useState(true);
  const [labels, setLabels] = useState<string[]>([]);
  const [doneIdx, setDoneIdx] = useState(-1);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const wrongChain = chainId !== CHAIN_ID;
  const terminal = record.status === 'unwound';

  async function run() {
    if (!address || !client) return;
    setPhase('running');
    setError('');
    try {
      setNote('Building the unwind plan…');
      const plan = fromClient<Plan>(await prepareUnwindAction(address, record.strategyHash, withdraw));
      if (plan.steps.length === 0) {
        await markUnwoundAction(address, record.strategyHash, []);
        setPhase('done');
        setNote('Already docked — position marked unwound.');
        toast('info', 'Position was already docked — marked unwound.');
        setTimeout(onDone, 1200);
        return;
      }
      setLabels(plan.steps.map((s) => s.label));
      const hashes: Hex[] = [];
      for (let i = 0; i < plan.steps.length; i++) {
        const s = plan.steps[i];
        setNote(`Signing: ${s.label}`);
        const hash = await sendTransactionAsync({ to: s.to, data: s.data, value: s.value ?? 0n, chainId: CHAIN_ID });
        await client.waitForTransactionReceipt({ hash });
        hashes.push(hash);
        setDoneIdx(i);
      }
      setNote('Marking unwound…');
      await markUnwoundAction(address, record.strategyHash, hashes);
      setPhase('done');
      setNote('Position unwound. Funds are back in your wallet.');
      toast('success', 'Position unwound — funds are back in your wallet.');
      setTimeout(onDone, 1400);
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).split('\n')[0];
      setError(msg);
      setPhase('error');
      toast('error', `Unwind failed: ${msg}`);
    }
  }

  if (terminal) {
    return (
      <p className="text-sm text-neutral-400">
        Position unwound.{' '}
        {record.unwindTxHashes?.length
          ? `txs ${record.unwindTxHashes.map((h) => shortHash(h)).join(', ')}`
          : 'No dock tx was needed.'}
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm text-neutral-400">
        Dock the strategy on Aqua{withdraw ? ' and withdraw both legs from Aave back to your wallet' : ''}. You
        keep principal plus all accrued yield.
      </p>

      <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-neutral-400">
        <input type="checkbox" checked={withdraw} onChange={(e) => setWithdraw(e.target.checked)} disabled={phase === 'running'} />
        Also withdraw from Aave (uncheck to keep earning Aave yield on the freed aTokens)
      </label>

      {wrongChain && phase === 'idle' && (
        <p className="mt-3 text-xs text-neutral-500">
          Wallet on chain {chainId}.{' '}
          <button className="underline hover:text-white" onClick={() => switchChainAsync({ chainId: CHAIN_ID }).catch(() => {})}>
            Switch to {CHAIN_ID}
          </button>
        </p>
      )}

      {labels.length > 0 && (
        <ol className="mt-4 space-y-1.5 text-xs">
          {labels.map((l, i) => (
            <li key={i} className="flex items-center gap-2">
              <span
                className="inline-block h-3.5 w-3.5 border text-center text-[9px] leading-[13px]"
                style={{ borderColor: i <= doneIdx ? ACCENT : 'rgba(255,255,255,0.2)', color: ACCENT }}
              >
                {i <= doneIdx ? '✓' : ''}
              </span>
              <span className={i <= doneIdx ? 'text-neutral-300' : 'text-neutral-500'}>{l}</span>
            </li>
          ))}
        </ol>
      )}

      {note && <p className="mt-3 text-xs text-neutral-400">{note}</p>}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      <div className="mt-4">
        {(phase === 'idle' || phase === 'confirm') && (
          <Button onClick={() => (phase === 'confirm' ? run() : setPhase('confirm'))} disabled={wrongChain}>
            {phase === 'confirm' ? 'Confirm — unwind now' : 'Unwind now'}
          </Button>
        )}
        {phase === 'running' && <Button disabled>Signing…</Button>}
        {phase === 'error' && (
          <Button variant="ghost" onClick={run}>
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
