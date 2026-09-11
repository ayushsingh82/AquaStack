'use client';

import { useEffect, useState } from 'react';

const ACCENT = '#FD5299';

export default function DocsNav({ items }: { items: readonly (readonly [string, string])[] }) {
  const [activeId, setActiveId] = useState<string>(items[0]?.[0] ?? '');

  useEffect(() => {
    const sections = items
      .map(([id]) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      {
        rootMargin: '-15% 0px -70% 0px',
        threshold: 0,
      },
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  return (
    <div className="sticky top-24 space-y-1 text-sm">
      <p className="mb-3 px-2 text-xs font-semibold tracking-[0.2em] text-neutral-600">ON THIS PAGE</p>
      {items.map(([id, label], i) => {
        const active = id === activeId;
        return (
          <a
            key={id}
            href={`#${id}`}
            aria-current={active ? 'true' : undefined}
            className="group relative flex items-center gap-2.5 border-l-2 py-1.5 pl-3 pr-2 transition-colors"
            style={{
              borderColor: active ? ACCENT : 'transparent',
              color: active ? '#fff' : undefined,
            }}
          >
            <span
              className="font-mono text-[10px] transition-colors"
              style={{ color: active ? ACCENT : 'rgb(82 82 82)' }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <span
              className={`transition-colors ${active ? 'text-white' : 'text-neutral-500 group-hover:text-neutral-300'}`}
            >
              {label}
            </span>
          </a>
        );
      })}
    </div>
  );
}
