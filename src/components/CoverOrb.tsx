import type { Track } from '@/lib/engine';
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

/** Big rounded-square cover (no per-frame drawing). */
export default function CoverOrb({ track, size = 280 }: { track: Track; size?: number }) {
  return (
    <div
      className="relative overflow-hidden rounded-[30px] ring-1 ring-white/10 shadow-[0_30px_70px_-20px_rgba(52,211,153,0.18)]"
      style={{ width: size, height: size, ...coverStyle(track.hue) }}
    >
      <CoverArt track={track} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
