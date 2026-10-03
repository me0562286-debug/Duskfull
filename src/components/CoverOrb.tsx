import { useEffect, useRef } from 'react';
import { engine, type Track } from '@/lib/engine';
import CoverArt from '@/components/CoverArt';

/** Deterministic cover-art gradient per track hue. */
export function coverStyle(hue: number): React.CSSProperties {
  return {
    background: `
      radial-gradient(120% 90% at 25% 15%, hsl(${hue} 85% 72% / .95), transparent 55%),
      radial-gradient(120% 120% at 85% 80%, hsl(${(hue + 60) % 360} 70% 45% / .9), transparent 60%),
      linear-gradient(160deg, hsl(${hue} 60% 30%), hsl(${(hue + 90) % 360} 55% 14%))`,
  };
}

/**
 * Album art wrapped in a ring of audio-reactive light bars —
 * a circular visualizer orbiting the cover.
 */
export default function CoverOrb({ track, size = 280 }: { track: Track; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr; canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const BARS = 72;
    let raf = 0;
    let t = 0;
    let smooth = new Array<number>(BARS).fill(0);

    const draw = () => {
      t += 0.016;
      const spec = engine.getSpectrum(BARS);
      smooth = smooth.map((v, i) => v + (spec[i] - v) * 0.35);
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2, cy = size / 2;
      const r0 = size * 0.335; // inner ring radius (hugs the cover)
      for (let i = 0; i < BARS; i++) {
        const a = (i / BARS) * Math.PI * 2 - Math.PI / 2;
        // idle breathing when nothing plays
        const idle = engine.playing ? 0 : 0.06 + 0.04 * Math.sin(t * 1.4 + i * 0.4);
        const v = Math.max(smooth[i], idle);
        const len = size * 0.02 + v * size * 0.115;
        const x1 = cx + Math.cos(a) * r0, y1 = cy + Math.sin(a) * r0;
        const x2 = cx + Math.cos(a) * (r0 + len), y2 = cy + Math.sin(a) * (r0 + len);
        const hue = (track.hue + i * 1.6) % 360;
        ctx.strokeStyle = `hsla(${hue} 90% ${62 + v * 20}% / ${0.25 + v * 0.75})`;
        ctx.lineWidth = size * 0.0065;
        ctx.lineCap = 'round';
        ctx.shadowColor = `hsla(${hue} 95% 65% / ${0.5 * v})`;
        ctx.shadowBlur = 12 * v + 2;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [track.hue, size]);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <canvas ref={ref} style={{ width: size, height: size }} className="absolute inset-0" />
      <div
        className="absolute overflow-hidden rounded-full shadow-[0_30px_80px_-10px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.35)] ring-1 ring-white/20"
        style={{ ...coverStyle(track.hue), inset: size * 0.165 }}
      >
        <CoverArt track={track} className="absolute inset-0 h-full w-full" />
        {/* glass sheen on the cover */}
        <div className="absolute inset-0 rounded-full bg-[linear-gradient(155deg,rgba(255,255,255,0.4),transparent_38%)]" />
        <div className="absolute inset-0 flex items-end justify-center pb-[12%]">
          <span className="text-[10px] uppercase tracking-[0.35em] text-white/70">
            {track.isDemo ? 'duskfall' : 'local'}
          </span>
        </div>
      </div>
    </div>
  );
}
