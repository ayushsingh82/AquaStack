import Link from 'next/link';
import CursorWave from '@/components/CursorWave';
import LiquidityFlow from '@/components/LiquidityFlow';
import ClosingCTA from '@/components/ClosingCTA';
import { Logo } from '@/components/Logo';

const ACCENT = '#FD5299';

const CORNER: Record<string, string> = {
  tl: 'top-0 left-0 border-t-2 border-l-2',
  tr: 'top-0 right-0 border-t-2 border-r-2',
  bl: 'bottom-0 left-0 border-b-2 border-l-2',
  br: 'bottom-0 right-0 border-b-2 border-r-2',
};

/* Official token logos (TrustWallet assets, served via the jsDelivr GitHub CDN).
   To pin them, drop the files in /public/logos/ and point LOGO at those paths. */
const LOGO = {
  usdc: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
  aave: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/ethereum/assets/0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9/logo.png',
  aqua: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/ethereum/assets/0x111111111117dC0aa78b770fA6A738034120C302/logo.png',
} as const;

function Connector() {
  return (
    <div className="flex justify-center py-2" aria-hidden>
      <span className="h-6 w-px bg-white/15" />
    </div>
  );
}

function ProtocolTag({ glyph, label }: { glyph: keyof typeof LOGO; label: string }) {
  return (
    <span className="inline-flex items-center gap-2.5 bg-[#151515] px-4 py-2.5 text-sm text-neutral-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO[glyph]} alt="" width={24} height={24} className="h-6 w-6 rounded-full" />
      {label}
    </span>
  );
}

function IconSplit() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 3v6" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 9c0 4-5 4-5 8M12 9c0 4 5 4 5 8" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="3" r="1.6" fill={ACCENT} />
      <circle cx="7" cy="19" r="1.6" fill={ACCENT} />
      <circle cx="17" cy="19" r="1.6" fill={ACCENT} />
    </svg>
  );
}

function IconAlertExit() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 3 L21.5 20 H2.5 Z" stroke={ACCENT} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 9.5v5" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="17.3" r="1.1" fill={ACCENT} />
    </svg>
  );
}

function IconWalletLock() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="2.5" y="6" width="19" height="14" rx="1.5" stroke={ACCENT} strokeWidth="1.8" />
      <path d="M2.5 10h19" stroke={ACCENT} strokeWidth="1.8" />
      <rect x="14.5" y="12.5" width="6" height="5" rx="1" fill="black" stroke={ACCENT} strokeWidth="1.5" />
      <path d="M16 12.5v-1.2a1.5 1.5 0 0 1 3 0v1.2" stroke={ACCENT} strokeWidth="1.5" />
    </svg>
  );
}

function IconDroplet() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2 C12 2 4 12 4 16.5 a8 8 0 0 0 16 0 C20 12 12 2 12 2Z"
        stroke={ACCENT}
        strokeWidth="1.8"
        fill="none"
      />
      <path d="M8.5 15.5a3.5 3.5 0 0 0 3.5 3.5" stroke={ACCENT} strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

const FEATURES = [
  {
    n: '01',
    corner: 'tl',
    Icon: IconSplit,
    title: 'One balance, two jobs',
    body: (
      <>
        Your deposit is supplied to Aave as a <span style={{ color: ACCENT }}>rebasing aToken</span> and, at
        the same time, registered as 1inch Aqua liquidity. The tokens{' '}
        <span style={{ color: ACCENT }}>never leave your wallet</span>, so they keep earning lending
        interest while they back swaps.
      </>
    ),
  },
  {
    n: '02',
    corner: 'tr',
    Icon: IconAlertExit,
    title: 'Auto-exit on depeg',
    body: (
      <>
        A rule you set (<span style={{ color: ACCENT }}>peg deviation, take-profit, stop-loss,
        max-drawdown</span>) is watched every few minutes. When it trips, a keeper unwinds the
        position and returns your stablecoins, <span style={{ color: ACCENT }}>even while you are offline</span>.
      </>
    ),
  },
  {
    n: '03',
    corner: 'bl',
    Icon: IconWalletLock,
    title: 'Non-custodial by design',
    body: (
      <>
        Your own wallet is the Aqua maker. AquaStack <span style={{ color: ACCENT }}>never holds funds</span>.
        The keeper only ever gets a session signer scoped to <code className="text-neutral-300">dock()</code>{' '}
        and <code className="text-neutral-300">withdraw()</code>. Nothing else.
      </>
    ),
  },
  {
    n: '04',
    corner: 'br',
    Icon: IconDroplet,
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

const FLOW: { big: string; small: string; tag: string; icons: (keyof typeof LOGO)[] }[] = [
  {
    tag: 'deposit',
    big: '1,000 USDC',
    small: 'you deposit, one signature',
    icons: ['usdc'],
  },
  {
    tag: 'split + ship',
    big: '≈ 495 aUSDC\n+ 495 aUSDbC',
    small: 'half swapped, both legs supplied to Aave v3, then shipped to 1inch Aqua',
    icons: ['aave', 'aqua'],
  },
  {
    tag: 'rule fires',
    big: '+36 bps',
    small: 'total return after 40 days: Aave APY + Aqua spread trips the take-profit rule',
    icons: [],
  },
  {
    tag: 'protected exit',
    big: '502.05 USDC',
    small: 'keeper docks the Aqua position and withdraws from Aave: principal + yield, back in your wallet',
    icons: ['usdc'],
  },
];

function IconWindow() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="2.5" y="4" width="19" height="16" rx="1.5" stroke={ACCENT} strokeWidth="1.8" />
      <path d="M2.5 8.5h19" stroke={ACCENT} strokeWidth="1.8" />
      <circle cx="5.5" cy="6.2" r="0.7" fill={ACCENT} />
      <circle cx="7.5" cy="6.2" r="0.7" fill={ACCENT} />
    </svg>
  );
}

function IconLink() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="15" r="4.2" stroke={ACCENT} strokeWidth="1.8" />
      <circle cx="15" cy="9" r="4.2" stroke="white" strokeWidth="1.8" opacity="0.5" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3 L20 6.5 V12 c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6.5 Z"
        stroke={ACCENT}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M8.5 12 L11 14.5 L15.5 9.5" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12.5" r="9" stroke={ACCENT} strokeWidth="1.8" />
      <path d="M12 7.5v5l3.5 2" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 2.5h6" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const LAYERS = [
  {
    name: 'Interface',
    Icon: IconWindow,
    desc: 'Deposit wizard, position dashboard, keeper console. Every chain read and tx-plan builder runs server-side; the wallet is Privy.',
  },
  {
    name: 'Aqua integration',
    Icon: IconLink,
    desc: 'Builds the deposit plan, the pegged aUSDC/aUSDT strategy, the live position read model, and the unwind plan.',
  },
  {
    name: 'Protective rules',
    Icon: IconShield,
    desc: 'A pure evaluator (peg deviation, take-profit, stop-loss, max-drawdown → hold · alert · unwind) over a per-position rule store.',
  },
  {
    name: 'Keeper',
    Icon: IconClock,
    desc: 'A cron pass over every active position: read state → evaluate the rule → act through a session signer while the user is offline.',
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col bg-black text-white">
      {/* ── Navbar ───────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-black/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold tracking-[0.22em]">
            <Logo size={26} />
            AQUASTACK
          </Link>
          <Link
            href="/app"
            className="bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
          >
            Open app
          </Link>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <header className="relative isolate flex min-h-[88vh] flex-col overflow-hidden">
        <CursorWave corners className="absolute inset-0 -z-10 h-full w-full" />

        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-6 py-24 text-center">
          <span
            className="mb-9 inline-flex items-center gap-2.5 bg-[#151515] px-5 py-2.5 text-sm font-medium text-neutral-100"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO.aqua} alt="" width={20} height={20} className="h-5 w-5 rounded-full" />
            Built on <span style={{ color: ACCENT }}>1inch&nbsp;Aqua</span>
          </span>
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
            Deposit once. Your balance works{' '}
            <span style={{ color: ACCENT }}>two&nbsp;jobs.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-neutral-400 sm:text-lg">
            One stablecoin deposit earns Aave lending yield <em>and</em> provides 1inch Aqua
            liquidity at the same time, with an automated rule that exits the position when the
            peg breaks.
          </p>
          <div className="mt-9">
            <Link
              href="/docs"
              className="bg-white px-6 py-3 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
            >
              Docs
            </Link>
          </div>
        </div>
      </header>

      {/* ── How it works ─────────────────────────────────────── */}
      <section id="how" className="px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <span
            className="mb-5 inline-block bg-black px-3 py-1.5 text-xs font-semibold tracking-[0.2em]"
            style={{ color: ACCENT }}
          >
            HOW IT WORKS
          </span>
          <h2 className="mb-14 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            The same aToken keeps earning while it backs swaps.
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.n} className="relative overflow-hidden bg-[#151515] p-8">
                <span
                  aria-hidden
                  className={`pointer-events-none absolute h-6 w-6 ${CORNER[f.corner]}`}
                  style={{ borderColor: ACCENT }}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-2 -top-6 select-none font-mono text-8xl font-bold"
                  style={{ color: ACCENT, opacity: 0.08 }}
                >
                  {f.n}
                </span>
                <div className="relative flex h-10 w-10 items-center justify-center border border-white/10 bg-black">
                  <f.Icon />
                </div>
                <h3 className="relative mt-4 text-lg font-medium">{f.title}</h3>
                <p className="relative mt-3 text-sm leading-6 text-neutral-400">{f.body}</p>
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
          <h2 className="mb-8 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            From a fork test: deposit to protected exit.
          </h2>

          {/* recipe strip */}
          <div className="mb-14 flex flex-wrap items-center gap-x-3 gap-y-2 text-xl text-neutral-600">
            <ProtocolTag glyph="usdc" label="USDC" />
            <span aria-hidden>→</span>
            <ProtocolTag glyph="aave" label="Aave v3" />
            <span aria-hidden>+</span>
            <ProtocolTag glyph="aqua" label="1inch Aqua" />
            <span aria-hidden>→</span>
            <ProtocolTag glyph="usdc" label="USDC + yield" />
          </div>

          <ol className="grid gap-5 lg:grid-cols-4">
            {FLOW.map((step, i) => (
              <li key={i} className="relative flex flex-col bg-[#151515] p-6">
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-0 top-0 h-7 w-7 border-l-2 border-t-2"
                  style={{ borderColor: ACCENT }}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute bottom-0 right-0 h-7 w-7 border-b-2 border-r-2"
                  style={{ borderColor: ACCENT }}
                />
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-medium" style={{ color: ACCENT }}>
                    0{i + 1}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">
                    {step.tag}
                  </span>
                </div>

                <div className="mt-5 flex h-6 items-center gap-1.5">
                  {step.icons.length > 0 ? (
                    step.icons.map((ic) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={ic} src={LOGO[ic]} alt="" width={22} height={22} className="h-[22px] w-[22px] rounded-full" />
                    ))
                  ) : (
                    <span className="h-2 w-2 rounded-full" style={{ background: ACCENT }} />
                  )}
                </div>

                <p className="mt-3 whitespace-pre-line font-mono text-lg font-medium leading-tight text-white">
                  {step.big}
                </p>
                <p className="mt-3 text-xs leading-5 text-neutral-400">{step.small}</p>
              </li>
            ))}
          </ol>

          <p className="mt-6 text-xs text-neutral-600">
            Numbers from <span className="font-mono text-neutral-400">npm run e2e:testnet</span>,
            executed against real Aave v3 on Base Sepolia with our own-deployed Aqua stack.
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
            Four layers, each doing one job.
          </h2>

          {/* the four layers */}
          <div className="grid gap-4 sm:grid-cols-2">
            {LAYERS.map((l, i) => (
              <div key={l.name} className="relative flex min-h-[200px] flex-col bg-[#151515] p-7">
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-0 top-0 h-6 w-6 border-l-2 border-t-2"
                  style={{ borderColor: ACCENT }}
                />
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center border border-white/10 bg-black">
                    <l.Icon />
                  </div>
                  <span className="font-mono text-xs text-neutral-600">0{i + 1}</span>
                </div>
                <h3 className="mt-4 text-base font-medium text-white">{l.name}</h3>
                <p className="mt-3 text-sm leading-6 text-neutral-400">{l.desc}</p>
              </div>
            ))}
          </div>

          <Connector />

          {/* foundation */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-[#151515] p-6">
            <div>
              <p className="text-base font-medium text-white">Base Sepolia</p>
              <p className="mt-1 text-xs text-neutral-500">
                real Aave v3 · Aqua + SwapVM redeployed from the 1inch repos (opcode-matched to the SDK)
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ProtocolTag glyph="aqua" label="1inch Aqua + SwapVM" />
              <ProtocolTag glyph="aave" label="Aave v3" />
            </div>
          </div>

          <div className="mt-10">
            <p className="mb-3 text-xs tracking-[0.15em] text-neutral-500">BASE SEPOLIA · CHAIN 84532</p>
            <div className="divide-y divide-white/10 border-y border-white/10 font-mono text-xs">
              {[
                ['Aave v3 Pool', '0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27'],
                ['aUSDC', '0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC'],
                ['aUSDT', '0xcE3CAae5Ed17A7AafCEEbc897DE843fA6CC0c018'],
                ['Aqua registry', '0x0771a4ca37e61993540ed939157635aa7d0f9584'],
                ['AquaSwapVMRouter', '0x693c469df6e60ba8bff5b9f4fba3455e4cd8dbf1'],
              ].map(([label, addr]) => (
                <div key={label} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                  <span className="min-w-[10rem] text-neutral-500">{label}</span>
                  <span className="break-all text-neutral-300">{addr}</span>
                </div>
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
              <p className="flex items-center gap-2.5 text-sm font-semibold tracking-[0.22em]">
                <Logo size={20} />
                AQUASTACK
              </p>
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
                    href="https://github.com/ayushsingh82/AquaStack"
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
            <span>© 2026 AquaStack · built at ETHGlobal</span>
            <span>Not affiliated with 1inch or Aave. Nothing here is financial advice.</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
