'use client';

import dynamic from 'next/dynamic';

const Ferrofluid = dynamic(() => import('./Ferrofluid'), { ssr: false });

const ACCENT = '#FD5299';

const STEPS = [
  { k: 'USDC', v: 'you deposit' },
  { k: 'aUSDC + aUSDbC', v: 'supplied to Aave, rebasing in your wallet' },
  { k: 'aqua.ship()', v: 'registered as pegged liquidity, tokens never move' },
  { k: 'swap settles', v: 'Aqua pulls one leg, pushes the other back' },
  { k: 'still deployed', v: 'rebalanced, both legs still earning Aave yield' },
];

export default function LiquidityFlow() {
  return (
    <section className="relative isolate overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <Ferrofluid
          colors={['#e8e8ea', '#a9a9b2', '#f4f4f6']}
          speed={0.5}
          scale={1.6}
          turbulence={1}
          fluidity={0.1}
          rimWidth={0.2}
          sharpness={2.5}
          shimmer={1.5}
          glow={2}
          flowDirection="down"
          opacity={1}
          mouseInteraction
          mouseStrength={1}
          mouseRadius={0.35}
        />
      </div>
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-black via-black/75 to-black/40" />

      <div className="mx-auto max-w-5xl px-6 py-28">
        <div className="max-w-xl">
          <p className="mb-3 text-xs font-semibold tracking-[0.2em]" style={{ color: ACCENT }}>
            LIQUIDITY
          </p>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Liquidity that flows both ways and never stops earning.
          </h2>
          <p className="mt-4 text-sm leading-6 text-neutral-300">
            The capital is never parked. It sits in your wallet as an interest-bearing aToken,
            and Aqua only touches it at the instant a swap needs it.
          </p>
        </div>

        <ol className="mt-12 max-w-2xl border border-white/15 bg-black/75 backdrop-blur-sm">
          {STEPS.map((s, i) => (
            <li
              key={s.k}
              className="flex flex-col gap-1 border-white/10 p-5 sm:flex-row sm:items-baseline sm:gap-5 [&:not(:last-child)]:border-b"
            >
              <span className="w-6 font-mono text-xs text-neutral-500">{`0${i + 1}`}</span>
              <span className="min-w-[12rem] font-mono text-base" style={{ color: ACCENT }}>
                {s.k}
              </span>
              <span className="text-sm text-neutral-300">{s.v}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
