import { useEffect, useRef } from 'react';

interface Star {
  x: number; y: number; r: number; base: number; speed: number; phase: number;
}

/** Procedural night sky: twinkling starfield, drifting dusk haze, crescent moon. */
export default function Backdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let stars: Star[] = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.floor((w * h) / 4200);
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h * 0.82,
        r: 0.3 + Math.random() * 1.3,
        base: 0.25 + Math.random() * 0.65,
        speed: 0.4 + Math.random() * 1.6,
        phase: Math.random() * Math.PI * 2,
      }));
    };
    resize();
    window.addEventListener('resize', resize);

    let t = 0;
    const draw = () => {
      t += 0.016;
      const w = canvas.clientWidth, h = canvas.clientHeight;

      // sky: deep indigo up top, dusk amber band at the horizon
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#07061a');
      sky.addColorStop(0.45, '#131136');
      sky.addColorStop(0.72, '#2c2154');
      sky.addColorStop(0.9, '#5b3261');
      sky.addColorStop(1, '#8a4b45');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // horizon glow (dusk)
      const glow = ctx.createRadialGradient(w * 0.5, h * 1.06, 0, w * 0.5, h * 1.06, h * 0.75);
      glow.addColorStop(0, 'rgba(246,201,68,0.34)');
      glow.addColorStop(0.35, 'rgba(255,143,12,0.16)');
      glow.addColorStop(1, 'rgba(255,143,12,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // slow drifting haze bands
      for (let i = 0; i < 3; i++) {
        const yy = h * (0.25 + i * 0.22) + Math.sin(t * 0.11 + i * 2.1) * 26;
        const hz = ctx.createLinearGradient(0, yy - 70, 0, yy + 70);
        hz.addColorStop(0, 'rgba(196,195,255,0)');
        hz.addColorStop(0.5, `rgba(196,195,255,${0.028 + 0.012 * Math.sin(t * 0.2 + i)})`);
        hz.addColorStop(1, 'rgba(196,195,255,0)');
        ctx.fillStyle = hz;
        ctx.fillRect(0, yy - 70, w, 140);
      }

      // crescent moon with glow
      const mx = w * 0.82, my = h * 0.14, mr = 26;
      const mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 4.2);
      mg.addColorStop(0, 'rgba(237,220,207,0.5)');
      mg.addColorStop(0.25, 'rgba(237,220,207,0.12)');
      mg.addColorStop(1, 'rgba(237,220,207,0)');
      ctx.fillStyle = mg;
      ctx.fillRect(mx - mr * 4.2, my - mr * 4.2, mr * 8.4, mr * 8.4);
      ctx.save();
      ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#eddccf';
      ctx.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(mx - mr * 0.55, my - mr * 0.2, mr * 0.9, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';

      // stars
      for (const s of stars) {
        const tw = s.base * (0.55 + 0.45 * Math.sin(t * s.speed + s.phase));
        ctx.globalAlpha = tw;
        ctx.fillStyle = '#e9e7ff';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        if (s.r > 1.2) { // sparkle cross on the brightest
          ctx.globalAlpha = tw * 0.4;
          ctx.fillRect(s.x - s.r * 3, s.y - 0.4, s.r * 6, 0.8);
          ctx.fillRect(s.x - 0.4, s.y - s.r * 3, 0.8, s.r * 6);
        }
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={ref} className="fixed inset-0 h-full w-full" aria-hidden />;
}
