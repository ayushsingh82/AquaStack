'use client';

import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { usePrivy } from '@privy-io/react-auth';
import { PRIVY_ENABLED } from './Providers';

const ACCENT = '#FD5299';
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function Pill({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="border bg-black px-3.5 py-1.5 text-xs font-medium transition-colors hover:bg-white/5"
      style={{ borderColor: ACCENT, color: ACCENT }}
    >
      {children}
    </button>
  );
}

function PrivyConnect() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const addr = user?.wallet?.address;
  if (!ready) return <span className="text-xs text-neutral-500">…</span>;
  if (authenticated && addr) return <Pill onClick={logout}>{short(addr)}</Pill>;
  return <Pill onClick={login}>Connect</Pill>;
}

function InjectedConnect() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  if (isConnected && address) return <Pill onClick={() => disconnect()}>{short(address)}</Pill>;
  return (
    <Pill onClick={() => connect({ connector: connectors[0] })}>
      {isPending ? 'Connecting…' : 'Connect wallet'}
    </Pill>
  );
}

export function ConnectButton() {
  return PRIVY_ENABLED ? <PrivyConnect /> : <InjectedConnect />;
}
