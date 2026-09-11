import type { Metadata } from 'next';
import Link from 'next/link';
import DocsNav from './DocsNav';

const ACCENT = '#FD5299';

export const metadata: Metadata = {
  title: 'Docs — AquaStack',
  description: 'What AquaStack is, how the protocol works, and what every number on the app means.',
};

function Section({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-white/10 py-12 first:border-t-0 first:pt-0">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs" style={{ color: ACCENT }}>
          {n}
        </span>
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
      </div>
      <div className="mt-5 space-y-4 text-sm leading-7 text-neutral-300 sm:text-[15px]">{children}</div>
    </section>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-[#151515] p-5">{children}</div>;
}

function Table({ head, rows }: { head: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto bg-[#151515] p-4">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="text-xs text-neutral-500">
          <tr className="border-b border-white/10">
            {head.map((h) => (
              <th key={h} className="py-2 pr-4 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="py-2 pr-4 text-neutral-300">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const NAV = [
  ['what', 'What is AquaStack'],
  ['how', 'How it works'],
  ['bps', 'bps'],
  ['deposit', 'Deposit'],
  ['position', 'Position page'],
  ['rule', 'The rule'],
  ['keeper', 'Keeper'],
  ['unwind', 'Unwind'],
  ['contracts', 'Contracts'],
] as const;

export default function DocsPage() {
  return (
    <main className="flex flex-1 flex-col bg-black text-white">
      <nav className="sticky top-0 z-50 bg-black/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm font-semibold tracking-[0.22em]">
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

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-6 py-14 lg:grid-cols-[220px_1fr]">
        {/* ── Side nav ── */}
        <aside className="hidden lg:block">
          <DocsNav items={NAV} />
        </aside>

        {/* ── Content ── */}
        <div className="min-w-0 lg:border-l lg:border-white/10 lg:pl-10">
          <p className="text-xs font-semibold tracking-[0.2em]" style={{ color: ACCENT }}>
            DOCS
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            What AquaStack is, and what every number means.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-400 sm:text-base">
            This page explains the protocol from first principles, then walks through every field on the
            app screen by screen — what it reads, where the number comes from on-chain, and what &quot;bps&quot;
            means when you see it.
          </p>

          <Section id="what" n="01" title="What is AquaStack">
            <p>
              In normal DeFi, a dollar does one job: it&apos;s lent on Aave, <em>or</em> it&apos;s LP&apos;d on a DEX.
              AquaStack makes one stablecoin deposit do both at once, non-custodially, with an automated
              rule that exits the position if the liquidity pool depegs.
            </p>
            <p>
              It&apos;s built on <strong>1inch Aqua</strong>, a shared-liquidity layer where a maker registers a
              <em> virtual</em> balance and the underlying tokens never leave the maker&apos;s wallet — Aqua only
              moves them (via <code className="text-neutral-200">pull()</code> /{' '}
              <code className="text-neutral-200">push()</code>) at the instant a swap actually settles.
              Because the tokens sit in the wallet the whole time, they can simultaneously be a{' '}
              <strong>rebasing Aave aToken</strong>, quietly accruing lending interest, while Aqua treats the
              same balance as live swap liquidity. Nothing is double-spent — Aqua can only ever pull up to
              the registered virtual balance.
            </p>
          </Section>

          <Section id="how" n="02" title="How it works">
            <Card>
              <ol className="space-y-3">
                <li>
                  <strong className="text-white">1. Supply.</strong> You deposit two stablecoins (USDC +
                  USDT on Base Sepolia). Both are supplied to Aave v3, minting rebasing aUSDC / aUSDT
                  directly into your wallet.
                </li>
                <li>
                  <strong className="text-white">2. Ship.</strong> Both aTokens are registered with 1inch
                  Aqua as a pegged AMM strategy (a narrow-band, roughly 1:1 market maker). Nothing moves —
                  this just tells Aqua &quot;these tokens, up to this amount, back swaps now.&quot;
                </li>
                <li>
                  <strong className="text-white">3. Earn, twice.</strong> The aTokens keep rebasing (Aave
                  yield) in your wallet. Meanwhile, real swaps route through the pegged pool; each one pays
                  the position a small spread (Aqua PnL) on top.
                </li>
                <li>
                  <strong className="text-white">4. Protected exit.</strong> A rule you set (peg deviation,
                  take-profit, stop-loss, max-drawdown) is checked on every keeper pass. If it trips, the
                  keeper docks the Aqua position and withdraws from Aave, returning principal + yield to
                  your wallet — automatically, even while you&apos;re offline.
                </li>
              </ol>
            </Card>
          </Section>

          <Section id="bps" n="03" title="bps">
            <p>
              <strong className="text-white">bps = basis points.</strong> 1 bps = 0.01%. 100 bps = 1%. Used
              everywhere in the app instead of raw percentages because the moves being measured are small
              and precision matters.
            </p>
            <Table
              head={['bps', '%']}
              rows={[
                ['1', '0.01%'],
                ['30', '0.3%'],
                ['75', '0.75%'],
                ['150', '1.5%'],
                ['500', '5%'],
              ]}
            />
          </Section>

          <Section id="deposit" n="04" title="Deposit wizard">
            <p>
              <strong className="text-white">Peg band</strong> sets how tightly the pegged AMM concentrates
              liquidity around 1:1 — a property of the strategy itself, fixed at deposit time.
            </p>
            <Table
              head={['Band', 'Behavior']}
              rows={[
                ['Tight · ±0.1%', 'More fee/spread capture per dollar, but any wobble pushes price out of band fast.'],
                ['Balanced · ±0.5%', 'The default. Room to absorb normal swap flow.'],
                ['Wide · ±2%', 'Only reacts to a real depeg, ignores noise.'],
              ]}
            />
          </Section>

          <Section id="position" n="05" title="Position page">
            <p>
              <strong className="text-white">Balances panel</strong> — for each leg: wallet balance (your
              actual on-chain aToken, rebasing on its own as Aave interest accrues), virtual balance (the
              fixed number Aqua has registered, only changes when a swap pulls/pushes against it), shipped
              (the original deposit amount for that leg), and accrued (wallet minus virtual — since the
              wallet rebases up but the virtual balance doesn&apos;t, this gap <em>is</em> your Aave yield,
              visible directly).
            </p>
            <p>
              <strong className="text-white">Yield panel</strong> — Aave interest (from comparing Aave&apos;s
              reserve index now vs. at ship time), Aqua PnL (spread earned from swaps, minus any inventory
              drift), and total return = both combined, in bps of principal.
            </p>
            <p>
              <strong className="text-white">Peg &amp; rule panel</strong> — current peg deviation (a live
              quote probe against the pool, 0 bps = perfectly balanced), the marker line (your rule&apos;s exit
              threshold), quote a→b / b→a (the live swap rate in each direction, ~1.00000 when healthy), and
              swap count.
            </p>
          </Section>

          <Section id="rule" n="06" title="The rule">
            <p>Every evaluation checks all four thresholds; only the fields you set are active.</p>
            <Table
              head={['Field', 'Meaning']}
              rows={[
                ['Peg deviation (bps)', 'Exit if the pool moves this far from 1:1.'],
                ['Take profit (bps)', 'Exit once total return reaches this. Off = no target.'],
                ['Stop loss (bps)', 'Exit if total return drops to −this value.'],
                ['Max drawdown (bps)', 'Exit if return falls this far from its own best-ever value.'],
                ['Auto-unwind', 'On = keeper signs the exit itself. Off = keeper only alerts.'],
              ]}
            />
            <Table
              head={['Preset', 'Peg dev.', 'Stop loss', 'Max drawdown', 'Auto-unwind']}
              rows={[
                ['Conservative', '30 bps', '50 bps', '40 bps', 'yes'],
                ['Balanced', '75 bps', '150 bps', '—', 'yes'],
                ['Alert only', '50 bps', '—', '—', 'no'],
              ]}
            />
          </Section>

          <Section id="keeper" n="07" title="Keeper">
            <p>
              A pass over every active/alerting position: read on-chain state → evaluate the rule → hold,
              alert, or unwind. Meant to run unattended on a schedule — this is what makes the exit real
              even if you&apos;re not watching.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong className="text-white">hold</strong> — nothing tripped, no action.
              </li>
              <li>
                <strong className="text-white">alert</strong> — a threshold tripped but auto-unwind is off;
                status flips to <em>alerting</em>, no transaction.
              </li>
              <li>
                <strong className="text-white">unwind</strong> — a threshold tripped and auto-unwind is on;
                the keeper signs and sends the exit itself.
              </li>
            </ul>
            <p>
              Signing happens through a <strong className="text-white">Privy session signer</strong> —
              delegated per-position, scoped to only <code className="text-neutral-200">dock()</code> and
              Aave <code className="text-neutral-200">withdraw()</code>. The keeper never holds your keys or
              custody of funds.
            </p>
          </Section>

          <Section id="unwind" n="08" title="Unwind">
            <p>Three steps, in order, whether triggered by you or the keeper:</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                <code className="text-neutral-200">dock()</code> — Aqua stops treating the strategy as live
                liquidity, freeing the virtual balance.
              </li>
              <li>
                Repay any variable debt (only if a swap direction left one leg borrowed) via{' '}
                <code className="text-neutral-200">repayWithATokens</code>.
              </li>
              <li>Withdraw both legs from Aave back to plain USDC / USDT in your wallet.</li>
            </ol>
            <p>Principal, accrued Aave yield, and any Aqua spread all land back in one shot.</p>
          </Section>

          <Section id="contracts" n="09" title="Contracts — Base Sepolia (84532)">
            <Table
              head={['Contract', 'Address']}
              rows={[
                ['Aqua registry (AquaRouter)', '0x0771a4ca37e61993540ed939157635aa7d0f9584'],
                ['AquaSwapVMRouter', '0x693c469df6e60ba8bff5b9f4fba3455e4cd8dbf1'],
                ['Aave v3 Pool', '0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27'],
                ['USDC / aUSDC', '0xba50Cd2A…4D5f / 0x10F1A9D1…0ACC'],
                ['USDT / aUSDT', '0x0a215D8b…E54a / 0xcE3CAae5…c018'],
                ['Aave faucet (open mint)', '0xD9145b5F45Ad4519c7ACcD6E0A4A82e83bB8A6Dc'],
              ]}
            />
            <p className="text-xs text-neutral-500">
              1inch Aqua + SwapVM have no official testnet deployment, so this is our own deployment of{' '}
              <code className="text-neutral-300">1inch/swap-vm@v1.0.2</code> (opcode-identical to the SDK)
              and <code className="text-neutral-300">1inch/aqua@main</code> — allowed under the 1inch bounty
              rules. Everything above is exercised end-to-end against these live contracts.
            </p>
          </Section>
        </div>
      </div>
    </main>
  );
}
