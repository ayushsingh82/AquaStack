import Link from 'next/link';
import CursorWave from '@/components/CursorWave';
import LiquidityFlow from '@/components/LiquidityFlow';
import ClosingCTA from '@/components/ClosingCTA';

const ACCENT = '#FD5299';

const NAV = [
  { label: 'Liquidity', href: '#flow' },
];

const CORNER: Record<string, string> = {
  tl: 'top-0 left-0 border-t-2 border-l-2',
  tr: 'top-0 right-0 border-t-2 border-r-2',
  bl: 'bottom-0 left-0 border-b-2 border-l-2',
  br: 'bottom-0 right-0 border-b-2 border-r-2',
};

/* Stylised protocol marks (not official logos — drop real SVGs in /public/logos/ to swap). */
function GlyphUSDC({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 6.5v11M9.2 9.4c0-1.2 1.3-2 2.8-2s2.8.8 2.8 2-1.1 1.7-2.8 2.1c-1.7.4-2.8.9-2.8 2.1s1.3 2 2.8 2 2.8-.8 2.8-2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
function GlyphAave({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <path
        d="M4 20 11 5c.4-.9 1.6-.9 2 0l7 15"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8.4 14.5h7.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="12" r="10.25" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
    </svg>
  );
}
function GlyphAqua({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <path
        d="M12 3c3.6 4.2 6.5 7.6 6.5 11.1A6.5 6.5 0 0 1 12 20.6a6.5 6.5 0 0 1-6.5-6.5C5.5 10.6 8.4 7.2 12 3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9 14.2a3 3 0 0 0 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ProtocolTag({ glyph, label }: { glyph: 'usdc' | 'aave' | 'aqua'; label: string }) {
  const G = glyph === 'usdc' ? GlyphUSDC : glyph === 'aave' ? GlyphAave : GlyphAqua;
  return (
    <span className="inline-flex items-center gap-1.5 border border-white/15 px-2 py-1 text-[11px] text-neutral-300">
      <G className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

const FEATURES = [
  {
    n: '01',
    corner: 'tl',
    title: 'One balance, two jobs',
    body: (
      <>
        Your deposit is supplied to Aave as a <span style={{ color: ACCENT }}>rebasing aToken</span> and, at
        the same time, registered as 1inch Aqua liquidity. The tokens{' '}
        <span style={{ color: ACCENT }}>never leave your wallet</span> — so they keep earning lending
        interest while they back swaps.
      </>
    ),
  },
  {
    n: '02',
    corner: 'tr',
    title: 'Auto-exit on depeg',
    body: (
      <>
        A rule you set — <span style={{ color: ACCENT }}>peg deviation, take-profit, stop-loss,
        max-drawdown</span> — is watched every few minutes. When it trips, a keeper unwinds the
        position and returns your stablecoins, <span style={{ color: ACCENT }}>even while you are offline</span>.
      </>
    ),
  },
  {
    n: '03',
    corner: 'bl',
    title: 'Non-custodial by design',
    body: (
      <>
        Your own wallet is the Aqua maker. AquaLadder <span style={{ color: ACCENT }}>never holds funds</span>.
        The keeper only ever gets a session signer scoped to <code className="text-neutral-300">dock()</code>{' '}
        and <code className="text-neutral-300">withdraw()</code> — nothing else.
      </>
    ),
  },
  {
    n: '04',
    corner: 'br',
    title: 'Built on 1inch Aqua',
    body: (
      <>
        Aqua is a shared-liquidity layer where capital stays in the wallet and is{' '}
        <span style={{ color: ACCENT }}>pulled only at the moment a swap settles</span>. That single
        property is what makes stacking Aave yield and LP liquidity on one balance possible.
      </>
    ),
  },
];

const FLOW: { big: string; small: string; tag?: string }[] = [
  { big: '1,000 USDC', small: 'you deposit — one signature', tag: 'deposit' },
  {
    big: '≈ 495 aUSDC + 495 aUSDbC',
    small: 'half swapped, both legs supplied to Aave v3, shipped to 1inch Aqua',
    tag: 'Aave + Aqua',
  },
  {
    big: '+36 bps',
    small: 'total return after 40 days — Aave APY + Aqua spread trips the take-profit rule',
    tag: 'rule fires',
  },
  {
    big: '502.05 USDC',
    small: 'keeper docks the Aqua position and withdraws from Aave — principal + yield, back in your wallet',
    tag: 'protected exit',
  },
];

const STACK = [
  ['src/lib/aqua', 'buildDeposit · buildPeggedStrategy · readPosition · buildUnwind'],
  ['src/lib/rules', 'evaluate(PositionState, Rule) → hold | alert | unwind · RuleStore'],
  ['src/lib/keeper', 'runKeeperOnce · tickPosition · PositionSigner · Notifier'],
  ['scripts', 'end-to-end fork tests against the live Aqua + Aave contracts'],
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col bg-black text-white">
      {/* ── Navbar ───────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-black/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm font-semibold tracking-[0.22em]">
            AQUALADDER
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            {NAV.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="text-sm text-neutral-400 transition-colors hover:text-white"
              >
                {item.label}
              </a>
            ))}
          </div>
          <Link
            href="/app"
            className="border bg-black px-4 py-2 text-sm font-medium transition-colors hover:bg-white/5"
            style={{ borderColor: ACCENT, color: ACCENT }}
          >
            Open app
          </Link>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <header className="relative isolate flex min-h-[88vh] flex-col overflow-hidden">
        <CursorWave className="absolute inset-0 -z-10 h-full w-full" />

        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-6 py-24 text-center">
          <span
            className="mb-7 border px-3 py-1 text-xs tracking-wide text-neutral-300"
            style={{ borderColor: ACCENT }}
          >
            Built on 1inch Aqua · Base
          </span>
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
            Deposit once. Your balance works{' '}
            <span style={{ color: ACCENT }}>two&nbsp;jobs.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-neutral-400 sm:text-lg">
            One stablecoin deposit earns Aave lending yield <em>and</em> provides 1inch Aqua
            liquidity at the same time — with an automated rule that exits the position when the
            peg breaks.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/app"
              className="border bg-black px-6 py-3 text-sm font-medium transition-colors hover:bg-white/5"
              style={{ borderColor: ACCENT, color: ACCENT }}
            >
              Open the app
            </Link>
            <a
              href="#how"
              className="border border-white/20 px-6 py-3 text-sm font-medium text-white transition-colors hover:border-white/40"
            >
              How it works
            </a>
          </div>
        </div>
      </header>

      {/* ── How it works ─────────────────────────────────────── */}
      <section id="how" className="px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <p className="mb-3 text-xs font-semibold tracking-[0.2em]" style={{ color: ACCENT }}>
            HOW IT WORKS
          </p>
          <h2 className="mb-14 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            The same aToken keeps earning while it backs swaps.
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.n} className="relative border border-white/15 bg-black p-8">
                <span
                  aria-hidden
                  className={`pointer-events-none absolute h-6 w-6 ${CORNER[f.corner]}`}
                  style={{ borderColor: ACCENT }}
                />
                <span className="font-mono text-xs" style={{ color: ACCENT }}>
                  {f.n}
                </span>
                <h3 className="mt-3 text-lg font-medium">{f.title}</h3>
                <p className="mt-3 text-sm leading-6 text-neutral-400">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Liquidity flow (Dither) ──────────────────────────── */}
      <LiquidityFlow />

      {/* ── Flow ─────────────────────────────────────────────── */}
      <section id="flow" className="px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <p className="mb-3 text-xs font-semibold tracking-[0.2em]" style={{ color: ACCENT }}>
            THE FLOW
          </p>
          <h2 className="mb-6 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            From a fork test — deposit to protected exit.
          </h2>
          <div className="mb-12 flex flex-wrap items-center gap-2">
            <ProtocolTag glyph="usdc" label="USDC" />
            <span className="text-neutral-600">→</span>
            <ProtocolTag glyph="aave" label="Aave v3" />
            <span className="text-neutral-600">+</span>
            <ProtocolTag glyph="aqua" label="1inch Aqua" />
            <span className="text-neutral-600">→</span>
            <ProtocolTag glyph="usdc" label="USDC + yield" />
          </div>

          <ol className="grid gap-4 lg:grid-cols-4">
            {FLOW.map((step, i) => (
              <li key={i} className="relative border border-white/15 bg-black p-5">
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-0 top-0 h-5 w-5 border-l-2 border-t-2"
                  style={{ borderColor: ACCENT }}
                />
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs" style={{ color: ACCENT }}>
                    0{i + 1}
                  </span>
                  {step.tag && (
                    <span className="text-[10px] uppercase tracking-wider text-neutral-600">
                      {step.tag}
                    </span>
                  )}
                </div>
                <p className="mt-3 font-mono text-base font-medium leading-snug text-white">
                  {step.big}
                </p>
                <p className="mt-2 text-xs leading-5 text-neutral-400">{step.small}</p>
                {i < FLOW.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-neutral-600 lg:block"
                  >
                    →
                  </span>
                )}
              </li>
            ))}
          </ol>
          <p className="mt-6 text-xs text-neutral-600">
            Numbers from <span className="font-mono text-neutral-400">npm run phase3:fork</span> —
            executed against the live Aqua + Aave v3 contracts on a Base mainnet fork.
          </p>
        </div>
      </section>

      {/* ── Architecture ─────────────────────────────────────── */}
      <section id="architecture" className="px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <p className="mb-3 text-xs font-semibold tracking-[0.2em]" style={{ color: ACCENT }}>
            ARCHITECTURE
          </p>
          <h2 className="mb-16 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Four layers. All fork-tested against live contracts.
          </h2>

          {/* layered stack */}
          <div className="space-y-3">
            <div className="border border-white/15 bg-black px-5 py-4">
              <p className="font-mono text-sm font-medium" style={{ color: ACCENT }}>
                src/app · src/components/app
              </p>
              <p className="mt-1 text-sm text-neutral-400">
                Next.js App Router — deposit wizard, position dashboard, keeper console. All chain
                access via <span className="font-mono text-neutral-300">&apos;use server&apos;</span> actions;
                wallet through Privy.
              </p>
            </div>

            <div className="flex justify-center text-neutral-700" aria-hidden>
              ▼
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {STACK.slice(0, 3).map(([name, desc]) => (
                <div key={name} className="border border-white/15 bg-black p-4">
                  <p className="font-mono text-sm font-medium" style={{ color: ACCENT }}>
                    {name}
                  </p>
                  <p className="mt-1.5 text-xs leading-5 text-neutral-400">{desc}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-center text-neutral-700" aria-hidden>
              ▼
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border border-white/15 bg-black px-5 py-4">
              <p className="text-sm text-neutral-400">
                Base mainnet — real deployed contracts, no testnet
              </p>
              <div className="flex gap-2">
                <ProtocolTag glyph="aqua" label="1inch Aqua + SwapVM" />
                <ProtocolTag glyph="aave" label="Aave v3" />
              </div>
            </div>
          </div>

          <div className="mt-10">
            <p className="mb-3 text-xs tracking-[0.15em] text-neutral-500">DEPLOYED ON BASE · CHAIN 8453</p>
            <div className="flex flex-wrap gap-2 text-xs">
              {[
                ['Aqua', '0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a'],
                ['AquaSwapVMRouter', '0x111111338c5091E8440b67B168bAe16a668AC0De'],
                ['Aave v3 Pool', '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5'],
              ].map(([label, addr]) => (
                <span
                  key={label}
                  className="max-w-full truncate border border-white/15 px-3 py-1.5 font-mono text-neutral-300"
                >
                  <span className="text-neutral-500">{label}</span> {addr}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Closing CTA (Ferrofluid) ─────────────────────────── */}
      <ClosingCTA />

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-10 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <p className="text-sm font-semibold tracking-[0.22em]">AQUALADDER</p>
              <p className="mt-3 max-w-sm text-sm text-neutral-500">
                One stablecoin deposit that earns Aave lending yield and provides 1inch Aqua
                liquidity at once, with an automated protective exit.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold tracking-[0.2em] text-neutral-500">PRODUCT</p>
              <ul className="mt-4 space-y-2 text-sm">
                <li>
                  <a href="#how" className="text-neutral-400 hover:text-white">
                    How it works
                  </a>
                </li>
                <li>
                  <a href="#flow" className="text-neutral-400 hover:text-white">
                    The flow
                  </a>
                </li>
                <li>
                  <Link href="/app" className="text-neutral-400 hover:text-white">
                    Open app
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold tracking-[0.2em] text-neutral-500">RESOURCES</p>
              <ul className="mt-4 space-y-2 text-sm">
                <li>
                  <a
                    href="https://github.com/ayushsingh82/AquaLadder"
                    target="_blank"
                    rel="noreferrer"
                    className="text-neutral-400 hover:text-white"
                  >
                    GitHub
                  </a>
                </li>
                <li>
                  <a href="#architecture" className="text-neutral-400 hover:text-white">
                    Architecture
                  </a>
                </li>
                <li>
                  <a
                    href="https://1inch.com/aqua/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-neutral-400 hover:text-white"
                  >
                    1inch Aqua
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-14 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-neutral-600 sm:flex-row sm:items-center sm:justify-between">
            <span>© 2026 AquaLadder · built at ETHGlobal</span>
            <span>Not affiliated with 1inch or Aave. Nothing here is financial advice.</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
