import Link from 'next/link';

export default function AppPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-[#06080c] px-6 text-center text-slate-100">
      <p className="text-xs font-semibold tracking-[0.2em] text-sky-300/80">AQUALADDER</p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">App coming next</h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
        The deposit flow, position dashboard and rule config are the next build step.
        The full integration library and keeper are done and fork-tested.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-full border border-white/15 px-5 py-2.5 text-sm text-slate-200 transition-colors hover:border-white/30 hover:bg-white/[0.04]"
      >
        ← Back
      </Link>
    </main>
  );
}
