'use client';

import { useEffect, useRef } from 'react';

/** 12-colour palette — aqua/teal core, warm + violet accents */
const COLORS = [
  '#38bdf8', '#22d3ee', '#2dd4bf', '#34d399',
  '#a3e635', '#facc15', '#fb923c', '#f97316',
  '#f472b6', '#e879f9', '#c084fc', '#818cf8',
];

type ShapeKind = 'circle' | 'square' | 'triangle';
const SHAPES: ShapeKind[] = ['circle', 'square', 'triangle'];

interface Dot {
  x: number;
  y: number;
  color: string;
  shape: ShapeKind;
  seed: number;
  t: number; // activation 0..1
}

function hash(i: number, j: number): number {
  let h = (Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  return h ^ (h >>> 15);
}

function drawShape(ctx: CanvasRenderingContext2D, kind: ShapeKind, r: number, rot: number) {
  ctx.beginPath();
  if (kind === 'circle') {
    ctx.arc(0, 0, r, 0, Math.PI * 2);
  } else if (kind === 'square') {
    ctx.save();
    ctx.rotate(rot);
    ctx.rect(-r, -r, r * 2, r * 2);
    ctx.restore();
  } else {
    ctx.save();
    ctx.rotate(rot);
    const a = r * 1.28;
    ctx.moveTo(0, -a);
    ctx.lineTo(a * 0.866, a * 0.5);
    ctx.lineTo(-a * 0.866, a * 0.5);
    ctx.closePath();
    ctx.restore();
  }
  ctx.fill();
}

interface CursorWaveProps {
  className?: string;
  /** grid spacing in px (default 30) */
  spacing?: number;
  /** influence radius of the cursor in px (default 150) */
  radius?: number;
  /** keep the effect permanently lit in the four corners (smaller reach on phones) */
  corners?: boolean;
}

export default function CursorWave({ className, spacing = 30, radius = 150, corners = false }: CursorWaveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let dots: Dot[] = [];
    const mouse = { x: 0, y: 0, active: false };
    let raf = 0;
    let last = performance.now();

    function build() {
      const rect = canvas!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      dots = [];
      const cols = Math.ceil(width / spacing) + 1;
      const rows = Math.ceil(height / spacing) + 1;
      const offX = (width - (cols - 1) * spacing) / 2;
      const offY = (height - (rows - 1) * spacing) / 2;
      for (let gx = 0; gx < cols; gx++) {
        for (let gy = 0; gy < rows; gy++) {
          const h = hash(gx, gy);
          dots.push({
            x: offX + gx * spacing,
            y: offY + gy * spacing,
            color: COLORS[h % COLORS.length],
            shape: SHAPES[(h >>> 8) % SHAPES.length],
            seed: ((h >>> 16) % 1000) / 1000,
            t: 0,
          });
        }
      }
    }

    function paintStatic() {
      ctx!.clearRect(0, 0, width, height);
      for (const d of dots) {
        ctx!.globalAlpha = 0.3;
        ctx!.fillStyle = d.color;
        ctx!.beginPath();
        ctx!.arc(d.x, d.y, 1.15, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
    }

    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      ctx!.clearRect(0, 0, width, height);

      const { x: mx, y: my, active } = mouse;
      const k = 14;

      // permanently-lit corner emitters, gently breathing. Larger radius than
      // the cursor + a high pulse floor so the dots near each corner fully
      // morph into their icons instead of staying dots. Smaller reach on
      // phones so the four clusters don't swallow the centred text.
      const cornersOn = corners;
      const cr = radius * (width < 768 ? 0.85 : 1.5);
      const cpts: [number, number, number][] = cornersOn
        ? [
            [0, 0, 0.9 + 0.1 * Math.sin(now * 0.0018)],
            [width, 0, 0.9 + 0.1 * Math.sin(now * 0.0018 + 1.9)],
            [0, height, 0.9 + 0.1 * Math.sin(now * 0.0018 + 3.4)],
            [width, height, 0.9 + 0.1 * Math.sin(now * 0.0018 + 5.1)],
          ]
        : [];

      for (const d of dots) {
        let target = 0;
        // source point the dot is pushed away from (strongest influence wins)
        let sx = d.x;
        let sy = d.y;

        if (active) {
          const ddx = d.x - mx;
          const ddy = d.y - my;
          const dd = Math.hypot(ddx, ddy) || 1;
          const n = Math.max(0, 1 - dd / radius);
          const tt = n * n * (3 - 2 * n);
          if (tt > target) {
            target = tt;
            sx = mx;
            sy = my;
          }
        }

        for (const [cx, cy, pulse] of cpts) {
          const ddx = d.x - cx;
          const ddy = d.y - cy;
          const dd = Math.hypot(ddx, ddy) || 1;
          const n = Math.max(0, 1 - dd / cr);
          const tt = n * n * (3 - 2 * n) * pulse;
          if (tt > target) {
            target = tt;
            sx = cx;
            sy = cy;
          }
        }

        const dx = d.x - sx;
        const dy = d.y - sy;
        const dist = Math.hypot(dx, dy) || 1;

        d.t += (target - d.t) * (1 - Math.exp(-dt * k));
        const t = d.t;

        if (t < 0.004) {
          ctx!.globalAlpha = 0.3;
          ctx!.fillStyle = d.color;
          ctx!.beginPath();
          ctx!.arc(d.x, d.y, 1.15, 0, Math.PI * 2);
          ctx!.fill();
          continue;
        }

        const r = 1.15 + t * 5.7;
        const push = t * 12;
        const px = d.x + (dx / dist) * push;
        const py = d.y + (dy / dist) * push;
        const rot = t * (Math.PI * 0.6) + d.seed * Math.PI * 2;
        const baseAlpha = 0.3 + t * 0.66;

        // cross-fade a plain dot into the dot's assigned shape
        const m = Math.min(1, Math.max(0, (t - 0.18) / 0.42));
        const ms = m * m * (3 - 2 * m);

        ctx!.save();
        ctx!.translate(px, py);
        ctx!.fillStyle = d.color;
        if (ms < 0.999) {
          ctx!.globalAlpha = baseAlpha * (1 - ms);
          drawShape(ctx!, 'circle', r, rot);
        }
        if (ms > 0.001 && d.shape !== 'circle') {
          ctx!.globalAlpha = baseAlpha * ms;
          drawShape(ctx!, d.shape, r, rot);
        } else if (d.shape === 'circle' && ms >= 0.999) {
          ctx!.globalAlpha = baseAlpha;
          drawShape(ctx!, 'circle', r, rot);
        }
        ctx!.restore();
      }
      ctx!.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }

    function onPointerMove(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      mouse.x = x;
      mouse.y = y;
      mouse.active = x >= -radius && x <= width + radius && y >= -radius && y <= height + radius;
    }
    function onPointerLeave() {
      mouse.active = false;
    }

    build();
    if (reduced) {
      paintStatic();
    } else {
      raf = requestAnimationFrame(frame);
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      document.addEventListener('pointerleave', onPointerLeave);
    }

    const ro = new ResizeObserver(() => {
      build();
      if (reduced) paintStatic();
    });
    ro.observe(canvas);

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else if (!reduced) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [spacing, radius, corners]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
