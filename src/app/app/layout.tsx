import type { ReactNode } from 'react';
import Link from 'next/link';
import { Providers } from '@/components/app/Providers';
import { ToastProvider } from '@/components/app/Toast';
import { AppBackground } from '@/components/app/AppBackground';
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
        <div className="relative flex min-h-screen flex-col text-white">
          <AppBackground />
          <header className="sticky top-0 z-40 bg-black/60 backdrop-blur">
            <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5">
              <Link
                href="/"
                className="shrink-0 text-xs font-semibold tracking-[0.18em] sm:text-sm sm:tracking-[0.22em]"
              >
                AQUALADDER
              </Link>
              <nav className="hidden items-center gap-8 md:flex">
                {NAV.map((n) => (
                  <NavLink key={n.href} {...n} />
                ))}
              </nav>
              <ConnectButton />
            </div>
            {/* mobile nav */}
            <nav className="flex gap-5 overflow-x-auto border-t border-white/10 px-4 py-2.5 md:hidden">
              {NAV.map((n) => (
                <NavLink key={n.href} {...n} />
              ))}
            </nav>
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">{children}</main>
        </div>
      </ToastProvider>
    </Providers>
  );
}
