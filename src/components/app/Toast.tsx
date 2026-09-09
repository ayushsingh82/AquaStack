'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ACCENT } from '@/lib/addresses';

/**
 * Task 23 — a minimal toast system for success / error feedback across the
 * deposit, rule, unwind and keeper flows. No dependency; auto-dismisses.
 */
type ToastKind = 'success' | 'error' | 'info';
type Toast = { id: number; kind: ToastKind; message: string };

const ToastCtx = createContext<{
  push: (kind: ToastKind, message: string) => void;
} | null>(null);

const COLOR: Record<ToastKind, string> = {
  success: '#4ade80',
  error: '#f87171',
  info: ACCENT,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, kind, message }]);
      setTimeout(() => remove(id), kind === 'error' ? 6000 : 3500);
    },
    [remove],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-3 border bg-black/90 px-4 py-3 text-sm backdrop-blur"
            style={{ borderColor: COLOR[t.kind] }}
          >
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: COLOR[t.kind] }} />
            <span className="flex-1 text-neutral-200">{t.message}</span>
            <button
              onClick={() => remove(t.id)}
              className="text-neutral-600 hover:text-white"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx.push;
}
