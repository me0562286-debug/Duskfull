/** Static aurora over pitch black: no animation, no canvas, nothing to repaint. */
export default function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden bg-[#04050a]">
      <div className="absolute -left-20 -top-32 h-[400px] w-[540px] -rotate-12"
        style={{ background: 'radial-gradient(closest-side, rgba(52,211,153,0.30), transparent)' }} />
      <div className="absolute -top-16 left-36 h-[320px] w-[420px] rotate-12"
        style={{ background: 'radial-gradient(closest-side, rgba(129,140,248,0.24), transparent)' }} />
    </div>
  );
}
