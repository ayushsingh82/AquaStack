'use client';

import { useState } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { usePrivy } from '@privy-io/react-auth';
import { PRIVY_ENABLED } from './Providers';

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
      <rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.5" cy="14" r="1.25" fill="currentColor" />
    </svg>
  );
}

function ConnectBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-2 bg-white px-3 py-2 text-xs font-semibold text-black transition-colors hover:bg-neutral-200 sm:px-4 sm:text-sm"
    >
      <WalletIcon />
      {label}
    </button>
  );
}

function Connected({ address, onDisconnect }: { address: string; onDisconnect: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        onClick={copy}
        title="Copy address"
        className="inline-flex items-center gap-2 bg-white px-3 py-2 text-xs font-medium text-black transition-colors hover:bg-neutral-200 sm:px-3.5 sm:text-sm"
      >
        <WalletIcon />
        <span className="font-mono">{copied ? 'Copied' : short(address)}</span>
      </button>
      <button
        onClick={onDisconnect}
        className="border border-white/15 px-2.5 py-2 text-xs text-neutral-400 transition-colors hover:border-white/30 hover:text-white sm:px-3 sm:text-sm"
      >
        Disconnect
      </button>
    </div>
  );
}

function PrivyConnect() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const addr = user?.wallet?.address;
  if (!ready) return <span className="px-2 text-xs text-neutral-500">…</span>;
  if (authenticated && addr) return <Connected address={addr} onDisconnect={logout} />;
  return <ConnectBtn onClick={login} label="Connect wallet" />;
}

function InjectedConnect() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  if (isConnected && address) return <Connected address={address} onDisconnect={() => disconnect()} />;
  return (
    <ConnectBtn
      onClick={() => connect({ connector: connectors[0] })}
      label={isPending ? 'Connecting…' : 'Connect wallet'}
    />
  );
}

export function ConnectButton() {
  return PRIVY_ENABLED ? <PrivyConnect /> : <InjectedConnect />;
}
