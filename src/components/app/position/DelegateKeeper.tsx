'use client';

import { useState } from 'react';
import { usePrivy, useDelegatedActions } from '@privy-io/react-auth';
import type { Address } from 'viem';
import type { PositionRecord } from '@/lib/rules/types';
import { delegateKeeperAction } from '@/app/app/actions';
import { fromClient } from '@/lib/serialize';
import { shortHash } from '@/lib/format';
import { Button } from '@/components/app/ui';
import { useToast } from '@/components/app/Toast';

/**
 * Task 22 — let the user delegate their Privy embedded wallet to the keeper for
 * this position, so it can `dock()` + `withdraw()` while they're offline.
 * Nothing else: the keeper never gets the key, only a scoped delegated action.
 */
export function DelegateKeeper({ record, onChange }: { record: PositionRecord; onChange: () => void }) {
  const { user, authenticated } = usePrivy();
  const { delegateWallet, revokeWallets } = useDelegatedActions();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const embedded = user?.wallet?.address;
  const isPrivyWallet = !!embedded && embedded.toLowerCase() === record.user.toLowerCase();
  const delegated = !!record.sessionSignerRef;

  async function delegate() {
    if (!embedded) return;
    setBusy(true);
    try {
      await delegateWallet({ address: embedded, chainType: 'ethereum' });
      fromClient(await delegateKeeperAction(record.user, record.strategyHash, embedded as Address));
      toast('success', 'Keeper delegated — it can now auto-unwind while you’re offline.');
      onChange();
    } catch (e) {
      toast('error', `Delegation failed: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      await revokeWallets();
      fromClient(await delegateKeeperAction(record.user, record.strategyHash, null));
      toast('info', 'Keeper delegation revoked.');
      onChange();
    } catch (e) {
      toast('error', `Revoke failed: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
    } finally {
      setBusy(false);
    }
  }

  if (delegated) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-neutral-300">
          <span className="text-green-400">●</span> Keeper delegated ·{' '}
          <span className="font-mono text-xs text-neutral-500">{shortHash(record.sessionSignerRef!)}</span>
        </span>
        <button onClick={revoke} disabled={busy} className="text-xs text-neutral-500 underline hover:text-white disabled:opacity-40">
          {busy ? '…' : 'Revoke'}
        </button>
      </div>
    );
  }

  if (!authenticated || !isPrivyWallet) {
    return (
      <p className="text-xs text-neutral-600">
        Auto-unwind while offline needs a Privy embedded wallet. The keeper will alert only until then.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-3 text-sm text-neutral-400">
        Delegate this wallet to the keeper — it gets a session signer scoped to{' '}
        <span className="font-mono text-neutral-200">dock()</span> +{' '}
        <span className="font-mono text-neutral-200">withdraw()</span>, nothing else, and can unwind the
        moment your rule trips even if you’re not around.
      </p>
      <Button onClick={delegate} disabled={busy}>
        {busy ? 'Delegating…' : 'Delegate to keeper'}
      </Button>
    </div>
  );
}
