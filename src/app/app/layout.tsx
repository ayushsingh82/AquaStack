import type { ReactNode } from 'react';
import Link from 'next/link';
import { Providers } from '@/components/app/Providers';
import { ToastProvider } from '@/components/app/Toast';
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
      <ToastProvider>
        <div className="flex min-h-screen flex-col bg-black text-white">
          <header className="sticky top-0 z-40 bg-black/70 backdrop-blur">
            <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
              <Link href="/" className="text-sm font-semibold tracking-[0.22em]">
                AQUALADDER
              </Link>
              <nav className="hidden items-center gap-8 md:flex">
                {NAV.map((n) => (
                  <NavLink key={n.href} {...n} />
                ))}
              </nav>
              <ConnectButton />
            </div>
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">{children}</main>
        </div>
      </ToastProvider>
    </Providers>
  );
}
