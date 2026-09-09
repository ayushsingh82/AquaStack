'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ACCENT } from '@/lib/addresses';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  const base = 'px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  if (variant === 'primary') {
    return (
      <button
        {...props}
        className={`${base} border bg-black hover:bg-white/5 ${className}`}
        style={{ borderColor: ACCENT, color: ACCENT }}
      />
    );
  }
  return <button {...props} className={`${base} border border-white/20 text-white hover:border-white/40 ${className}`} />;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-[#151515] p-6 ${className}`}>{children}</div>;
}

export function Label({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-xs font-medium tracking-wide text-neutral-400">{children}</p>;
}

export function Option({
  active,
  onClick,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      onClick={onClick}
      className="border p-4 text-left transition-colors"
      style={{
        borderColor: active ? ACCENT : 'rgba(255,255,255,0.15)',
        background: active ? 'rgba(253,82,153,0.06)' : 'transparent',
      }}
    >
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mt-1 text-xs text-neutral-500">{hint}</p>
    </button>
  );
}
