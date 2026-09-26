import { useEffect, useRef } from 'react';

const LIFE_MS = 700;           // how long a stretch of vapour lasts
const COLOR = '143, 179, 217'; // --sky (#8fb3d9)

/**
 * A thin sky-blue vapour line that follows the mouse and fades out behind it,
 * like an aircraft contrail. Decorative only: aria-hidden, never intercepts
 * input, and the native cursor stays visible.
 *
 * Cheap by design: one viewport-sized canvas, and the animation loop only
 * runs while there is vapour on screen — when the mouse is still, it stops.
 */
export default function ContrailCursor() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let w = 0, h = 0;
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();

    let pts: { x: number; y: number; t: number }[] = [];
    let raf = 0;

    const draw = (now: number) => {
      pts = pts.filter(p => now - p.t < LIFE_MS);
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = 'round';
      for (let i = 1; i < pts.length; i++) {
        const a = 1 - (now - pts[i].t) / LIFE_MS;
        ctx.strokeStyle = `rgba(${COLOR}, ${(a * 0.8).toFixed(3)})`;
        ctx.lineWidth = 1 + a * 2.5;
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
      raf = pts.length ? requestAnimationFrame(draw) : 0;
    };

    const onMove = (e: MouseEvent) => {
      pts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (!raf) raf = requestAnimationFrame(draw);
    };
    // Scrolling moves the page under a still mouse; drop the old line so it
    // doesn't hang in mid-air.
    const onScroll = () => { pts = []; ctx.clearRect(0, 0, w, h); };

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', fit);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', fit);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[55] h-screen w-screen"
    />
  );
}
