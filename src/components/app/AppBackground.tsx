'use client';

import dynamic from 'next/dynamic';

const Ferrofluid = dynamic(() => import('@/components/Ferrofluid'), { ssr: false });

/**
 * Faint ambient ferrofluid behind the whole /app shell — the same effect as the
 * landing page's closing CTA, dialled way down and dark-overlaid so it never
 * competes with the UI. Degrades to plain black where WebGL is unavailable.
 */
export function AppBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 bg-black">
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
        className="h-full w-full"
      />
      {/* darker toward the top where the nav + page headings + first card sit,
          more open lower down where the page is mostly empty */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/55 to-black/40" />
    </div>
  );
}
