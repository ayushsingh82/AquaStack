'use client';

import { useState, type ReactNode } from 'react';

const ACCENT = '#FD5299';

export type DocsNavGroup = {
  label: string;
  items: readonly (readonly [string, string])[];
};

export default function DocsShell({
  groups,
  content,
}: {
  groups: readonly DocsNavGroup[];
  content: Record<string, ReactNode>;
}) {
  const flat = groups.flatMap((g) => g.items);
  const [active, setActive] = useState<string>(flat[0]?.[0] ?? '');
  let counter = 0;

  return (
    <>
      {/* ── Side nav (desktop) ── */}
      <aside className="hidden lg:block">
        <nav className="sticky top-24 space-y-6 text-sm">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-600">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map(([id, label]) => {
                  counter += 1;
                  const isActive = id === active;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActive(id)}
                      aria-current={isActive ? 'true' : undefined}
                      className="group relative flex w-full items-center gap-2.5 border-l-2 py-1.5 pl-3 pr-2 text-left transition-colors"
                      style={{ borderColor: isActive ? ACCENT : 'transparent' }}
                    >
                      <span
                        className="font-mono text-[10px] transition-colors"
                        style={{ color: isActive ? ACCENT : 'rgb(82 82 82)' }}
                      >
                        {String(counter).padStart(2, '0')}
                      </span>
                      <span
                        className={`transition-colors ${isActive ? 'text-white' : 'text-neutral-500 group-hover:text-neutral-300'}`}
                      >
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* ── Content ── */}
      <div className="min-w-0 lg:border-l lg:border-white/10 lg:pl-10">
        {/* Section picker (mobile / no sidebar) */}
        <div className="mb-8 lg:hidden">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-600">
            Jump to
          </label>
          <select
            value={active}
            onChange={(e) => setActive(e.target.value)}
            className="w-full appearance-none border border-white/15 bg-[#151515] px-3 py-2.5 text-sm text-white"
          >
            {groups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.items.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {content[active]}
      </div>
    </>
  );
}
