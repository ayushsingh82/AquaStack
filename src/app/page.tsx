import Link from 'next/link';
import CursorWave from '@/components/CursorWave';
import LiquidityFlow from '@/components/LiquidityFlow';
import ClosingCTA from '@/components/ClosingCTA';

const ACCENT = '#FD5299';

const NAV = [
  { label: 'Liquidity', href: '#flow' },
  { label: 'Architecture', href: '#architecture' },
];

const CORNER: Record<string, string> = {
  tl: 'top-0 left-0 border-t-2 border-l-2',
  tr: 'top-0 right-0 border-t-2 border-r-2',
  bl: 'bottom-0 left-0 border-b-2 border-l-2',
  br: 'bottom-0 right-0 border-b-2 border-r-2',
};

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

const FLOW = [
  ['1,000 USDC', 'you deposit'],
  ['≈ 495 aUSDC + 495 aUSDbC', 'split, supplied to Aave, shipped to Aqua'],
  ['+36 bps', 'total return after 40 days — trips the take-profit rule'],
  ['502.05 USDC', 'keeper unwinds; principal + yield back in your wallet'],
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
          <h2 className="mb-16 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            From a fork test — deposit to protected exit.
          </h2>
          <div className="relative max-w-3xl">
            <div className="absolute bottom-2 left-[7px] top-2 w-px bg-white/15" />
            <ol className="space-y-9">
              {FLOW.map(([big, small], i) => (
                <li key={i} className="relative pl-10">
                  <span
                    className="absolute left-0 top-1 h-[15px] w-[15px] rounded-full border-2 bg-black"
                    style={{ borderColor: ACCENT }}
                  />
                  <p className="font-mono text-lg font-medium text-white">{big}</p>
                  <p className="mt-1 text-sm text-neutral-400">{small}</p>
                </li>
              ))}
            </ol>
          </div>
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
          <div className="divide-y divide-white/10 border-y border-white/15">
            {STACK.map(([name, desc]) => (
              <div key={name} className="flex flex-col gap-2 py-5 sm:flex-row sm:items-center sm:gap-8">
                <p
                  className="min-w-[11rem] border-l-2 pl-3 font-mono text-sm font-medium"
                  style={{ borderColor: ACCENT, color: ACCENT }}
                >
                  {name}
                </p>
                <p className="text-sm text-neutral-400">{desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-10">
            <p className="mb-3 text-xs tracking-[0.15em] text-neutral-500">DEPLOYED ON BASE · CHAIN 8453</p>
            <div className="flex flex-wrap gap-2 text-xs">
              {[
                ['Aqua', '0x1111113CCf…'],
                ['AquaSwapVMRouter', '0x111111338c…'],
                ['Aave v3 Pool', '0xA238Dd80C2…'],
              ].map(([label, addr]) => (
                <span key={label} className="border border-white/15 px-3 py-1.5 font-mono text-neutral-300">
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
