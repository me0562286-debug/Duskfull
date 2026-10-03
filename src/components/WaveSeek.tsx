import { useEffect, useRef } from 'react';
import { engine } from '@/lib/engine';

interface Props {
  progress: number; // 0..1 (fallback only; live position is read every frame)
  onSeek: (p: number) => void;
}

const H = 40;
const STEPS = 70;
const wave = (amp: number, upTo: number, phase: number) => {
  let d = `M 0 ${H / 2}`;
  for (let i = 1; i <= STEPS; i++) {
    const x = (i / STEPS) * 100;
    const y = H / 2 + (x / 100 <= upTo ? Math.sin(i * 0.55 - phase) * amp * Math.sin((i / STEPS) * Math.PI) : 0);
    d += ` L ${x} ${y.toFixed(1)}`;
  }
  return d;
};

/** Wavy seek bar, redrawn every animation frame so the thumb and ripple glide. */
export default function WaveSeek({ progress, onSeek }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const played = useRef<SVGPathElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const fallback = useRef(progress);
  fallback.current = progress;

  useEffect(() => {
    let raf = 0, phase = 0, shown = -1;
    const loop = () => {
      const d = engine.duration;
      const target = drag.current ?? (d > 0 ? Math.min(1, engine.time / d) : fallback.current);
      shown = shown < 0 || drag.current !== null ? target : shown + (target - shown) * 0.5;
      if (engine.playing) phase += 0.09;
      played.current?.setAttribute('d', wave(6, shown, phase));
      if (thumb.current) thumb.current.style.transform = `translate(${shown * (box.current?.clientWidth ?? 0)}px, -50%)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const pos = (x: number) => {
    const r = box.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (x - r.left) / r.width));
  };
  const down = (e: React.PointerEvent) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = pos(e.clientX); };
  const move = (e: React.PointerEvent) => { if (drag.current !== null) drag.current = pos(e.clientX); };
  const up = () => { if (drag.current !== null) onSeek(drag.current); drag.current = null; };

  return (
    <div ref={box} className="relative h-10 w-full cursor-pointer touch-none select-none"
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="h-full w-full">
        <path d={wave(0, 1, 0)} fill="none" stroke="rgba(233,231,255,0.18)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        <path ref={played} fill="none" stroke="url(#seekGrad)" strokeWidth="2.4" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
        <defs>
          <linearGradient id="seekGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#f6c944" /><stop offset="1" stopColor="#ff8f5c" />
          </linearGradient>
        </defs>
      </svg>
      <div ref={thumb} className="pointer-events-none absolute left-0 top-1/2 -ml-2 h-4 w-4 rounded-full bg-[#f6c944] shadow-[0_0_14px_rgba(246,201,68,0.9)]" />
    </div>
  );
}
