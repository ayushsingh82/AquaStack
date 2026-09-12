const ACCENT = '#FD5299';

/** Droplet built from three stacked bars — the AquaStack mark. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden>
      <clipPath id="aquastack-logo-clip">
        <path d="M20 2 C20 2 6 20 6 28 a14 14 0 0 0 28 0 C34 20 20 2 20 2Z" />
      </clipPath>
      <g clipPath="url(#aquastack-logo-clip)">
        <rect x="0" y="4" width="40" height="11" fill={ACCENT} opacity="0.45" />
        <rect x="0" y="16" width="40" height="11" fill={ACCENT} opacity="0.7" />
        <rect x="0" y="28" width="40" height="11" fill={ACCENT} />
      </g>
      <path
        d="M20 2 C20 2 6 20 6 28 a14 14 0 0 0 28 0 C34 20 20 2 20 2Z"
        stroke={ACCENT}
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  );
}
