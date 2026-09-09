import type { ReactNode } from 'react';
import Link from 'next/link';
import { Providers } from '@/components/app/Providers';
import { ConnectButton } from '@/components/app/ConnectButton';
import { NavLink } from '@/components/app/NavLink';

const NAV = [
  { href: '/app', label: 'Positions' },
  { href: '/app/deposit', label: 'New deposit' },
  { href: '/app/keeper', label: 'Keeper' },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <div className="flex min-h-screen flex-col bg-black text-white">
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-white/10 bg-black/70 px-6 py-3.5 backdrop-blur">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-sm font-semibold tracking-[0.22em]">
              AQUALADDER
            </Link>
            <nav className="hidden gap-6 md:flex">
              {NAV.map((n) => (
                <NavLink key={n.href} {...n} />
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden border border-white/15 px-2.5 py-1 text-xs text-neutral-400 sm:inline">
              Base fork · 8453
            </span>
            <ConnectButton />
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">{children}</main>
      </div>
    </Providers>
  );
}
