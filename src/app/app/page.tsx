import Link from 'next/link';

const ACCENT = '#FD5299';

export default function PositionsPage() {
  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em]" style={{ color: ACCENT }}>
            POSITIONS
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Your positions</h1>
        </div>
        <Link
          href="/app/deposit"
          className="border bg-black px-4 py-2 text-sm font-medium transition-colors hover:bg-white/5"
          style={{ borderColor: ACCENT, color: ACCENT }}
        >
          New deposit
        </Link>
      </div>

      <div className="mt-10 border border-white/15 p-12 text-center">
        <p className="text-sm text-neutral-400">No positions yet.</p>
        <p className="mt-1 text-xs text-neutral-600">
          The positions list (task 11) renders here once the deposit flow is wired.
        </p>
      </div>
    </div>
  );
}
