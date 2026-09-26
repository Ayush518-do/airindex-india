import { useMotionSettings } from '../lib/motion';

// Soft cloud puffs: position, size, drift speed and a negative delay so they
// start spread across the sky rather than all entering from the left.
const CLOUDS = [
  { top: '4%', w: 520, h: 150, drift: 150, delay: -20, opacity: 0.9 },
  { top: '14%', w: 340, h: 100, drift: 190, delay: -110, opacity: 0.75 },
  { top: '26%', w: 620, h: 170, drift: 230, delay: -60, opacity: 0.6 },
  { top: '9%', w: 260, h: 80, drift: 170, delay: -150, opacity: 0.7 },
  { top: '36%', w: 420, h: 120, drift: 260, delay: -200, opacity: 0.45 },
];

/**
 * Behind every inner page: pale sky at the top fading into cloud white, with
 * a few soft clouds drifting across very slowly (2–4 minutes per crossing).
 * Plain CSS — no canvas or WebGL — and static under reduced motion.
 */
export default function SkyBackdrop() {
  const { heavyEffects } = useMotionSettings();
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="sky-backdrop absolute inset-x-0 top-0 h-[85vh]" />
      <div className="absolute inset-x-0 top-0 h-[70vh]">
        {CLOUDS.map((c, i) => (
          <span
            key={i}
            className="sky-cloud"
            style={{
              top: c.top, left: 0, width: c.w, height: c.h, opacity: c.opacity,
              ['--drift' as string]: `${c.drift}s`,
              ['--delay' as string]: `${c.delay}s`,
              // Without motion, park them at fixed spots across the sky.
              ...(heavyEffects ? null : { transform: `translateX(${(i * 23) % 90}vw)`, animation: 'none' }),
            }}
          />
        ))}
      </div>
    </div>
  );
}
