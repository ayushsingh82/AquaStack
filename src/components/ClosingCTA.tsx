'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';

const Ferrofluid = dynamic(() => import('./Ferrofluid'), { ssr: false });

const ACCENT = '#FD5299';

export default function ClosingCTA() {
  return (
    <section className="relative isolate flex min-h-[70vh] items-center overflow-hidden">
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
      <div className="pointer-events-none absolute inset-0 -z-10 bg-black/50" />

      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Put your stablecoins to work{' '}
          <span style={{ color: ACCENT }}>twice</span>.
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-sm leading-6 text-neutral-300 sm:text-base">
          Lending yield and Aqua liquidity on one balance, with a rule that exits before
          it hurts. Non-custodial, fork-tested against the live contracts.
        </p>
        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/app"
            className="px-6 py-3 text-sm font-medium text-black transition-opacity hover:opacity-90"
            style={{ backgroundColor: ACCENT }}
          >
            Open the app
          </Link>
          <a
            href="https://github.com/ayushsingh82/AquaLadder"
            target="_blank"
            rel="noreferrer"
            className="border border-white/25 px-6 py-3 text-sm font-medium text-white transition-colors hover:border-white/50"
          >
            Read the code
          </a>
        </div>
      </div>
    </section>
  );
}
