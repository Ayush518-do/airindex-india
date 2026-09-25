import { useEffect, useRef, useState } from 'react';
import { markIntroSeen } from '../lib/intro';
import CloudLayer from './CloudLayer';

/**
 * Cinematic intro: the camera holds in open sky while an aircraft flies out of
 * the distance, accelerates toward the viewpoint and passes through it, then
 * the app is revealed.
 *
 * Depth comes from one shared approach law (see F0/K below) rather than an
 * eased scale: apparent size grows exponentially, so the aircraft reads as
 * closing distance at speed. Clouds run the same law at different phases, so
 * near ones sweep outward past the lens while far ones barely drift.
 *
 * Photographic assets are optional and hot-swappable (see ASSETS below):
 * drop them in and the same flight path renders photoreal.
 */

// Optional photoreal assets — served from frontend/public/.
// Any that are missing fall back to vector/CSS so the intro always runs.
const ASSETS = {
  plane: '/intro/plane.png',   // front-facing aircraft, transparent background
  sky: '/intro/sky.jpg',       // backdrop photo
  cloud: '/intro/cloud.png',   // soft cloud sprite, transparent background
};

const FLIGHT_MS = 4200;    // time from first appearance to the pass
const REVEAL_MS = 420;     // fade to the app after the pass

/**
 * Apparent size follows an exponential approach: frac(p) = F0 · e^(K·p),
 * i.e. the closing distance decays by a constant factor each moment. A real
 * aircraft at constant speed projects hyperbolically — invisible for most of
 * the shot, then a single-frame explosion — which is why a literal simulation
 * reads worse than this. The exponential keeps the growth continuous and
 * always accelerating, hitting the storyboard beats:
 *   p=.17 → 6% of screen   p=.36 → 14%   p=.64 → 44%   p=.86 → 110%
 */
const F0 = 0.03;             // starting fraction of viewport width
const K = Math.log(66);      // growth rate across the shot
const PASS_FRAC = 7;         // aircraft is past the lens beyond this size
const BASE_W = 300;          // intrinsic aircraft width in px (asset is 755x305)

/**
 * Terminal surge: over the last stretch the aircraft accelerates hard so it
 * visibly overruns the lens instead of merely vanishing at full size. Without
 * it the shot ends with the plane still framed, which reads as a fade-out.
 */
const SURGE_FROM = 0.86;
const SURGE_GAIN = 7;

const approach = (p: number) => {
  const base = F0 * Math.exp(K * p);
  const over = Math.max(0, p - SURGE_FROM) / (1 - SURGE_FROM);
  return base * (1 + SURGE_GAIN * over * over);
};

// Cue text by elapsed time, matching the storyboard beats.
const CUES: { at: number; until: number; lines: string[]; align: 'center' | 'right' }[] = [
  { at: 0, until: 700, lines: [], align: 'center' },
  { at: 700, until: 1500, lines: ['Better Data', 'Better Travel', 'A Brighter Tomorrow'], align: 'right' },
  { at: 1500, until: 2700, lines: ['Track Prices', 'Compare Trends', 'Travel Smarter'], align: 'right' },
  { at: 2700, until: 3600, lines: ['India Travels Forward'], align: 'center' },
  { at: 3600, until: 4300, lines: ['And the Journey Begins'], align: 'center' },
];

/**
 * Cloud field. `phase` is how far along the same approach curve each cloud
 * already is, so nearer clouds (higher phase) sweep outward past the lens
 * while distant ones barely drift — parallax from one shared law.
 * `dir` is the radial direction it flies off toward.
 */
const CLOUDS = [
  { dirX: -0.9, dirY: 0.35, phase: 0.30, size: 0.55 },
  { dirX: 0.8, dirY: -0.5, phase: 0.22, size: 0.48 },
  { dirX: -0.7, dirY: -0.55, phase: 0.14, size: 0.62 },
  { dirX: 0.95, dirY: 0.4, phase: 0.06, size: 0.52 },
  { dirX: -0.5, dirY: 0.85, phase: -0.04, size: 0.7 },
  { dirX: 0.55, dirY: -0.8, phase: -0.12, size: 0.6 },
  { dirX: -1.0, dirY: 0.05, phase: -0.2, size: 0.75 },
  { dirX: 0.75, dirY: 0.6, phase: -0.3, size: 0.66 },
  { dirX: -0.35, dirY: -0.95, phase: -0.4, size: 0.8 },
  { dirX: 0.4, dirY: 0.9, phase: -0.5, size: 0.72 },
];

export default function IntroSplash({ onDone }: { onDone: () => void }) {
  const [t, setT] = useState(0);          // elapsed ms
  const [leaving, setLeaving] = useState(false);
  const [has, setHas] = useState({ plane: false, sky: false, cloud: false });
  const done = useRef(false);
  const raf = useRef(0);

  // Probe optional assets; whatever exists gets used.
  useEffect(() => {
    let live = true;
    (Object.keys(ASSETS) as (keyof typeof ASSETS)[]).forEach(k => {
      const img = new Image();
      img.onload = () => live && setHas(p => ({ ...p, [k]: true }));
      img.src = ASSETS[k];
    });
    return () => { live = false; };
  }, []);

  // `?introAt=0.55` freezes the shot at that progress for tuning/inspection.
  const frozenAt = (() => {
    if (typeof window === 'undefined') return null;
    const v = new URLSearchParams(window.location.search).get('introAt');
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;
  })();

  // Single rAF clock drives the whole shot — continuous, not staged.
  useEffect(() => {
    if (frozenAt != null) return;
    const t0 = performance.now();
    const tick = (now: number) => {
      const elapsed = now - t0;
      setT(elapsed);
      if (elapsed >= FLIGHT_MS) finish();
      else raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);

    // Safety net: rAF is throttled in background tabs, so guarantee the
    // overlay never strands the app.
    const guard = window.setTimeout(finish, FLIGHT_MS + 2500);
    return () => { cancelAnimationFrame(raf.current); clearTimeout(guard); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finish() {
    if (done.current) return;
    done.current = true;
    cancelAnimationFrame(raf.current);
    setLeaving(true);
    markIntroSeen();
    window.setTimeout(onDone, REVEAL_MS);
  }

  const progress = frozenAt != null ? frozenAt : Math.min(1, t / FLIGHT_MS);
  const vw = typeof window === 'undefined' ? 1440 : window.innerWidth;

  // Aircraft: apparent size straight off the approach curve.
  const planeFrac = approach(progress);
  const planeScale = (planeFrac * vw) / BASE_W;
  const passed = planeFrac > PASS_FRAC;

  const cueT = frozenAt != null ? frozenAt * FLIGHT_MS : t;
  const cue = CUES.find(c => cueT >= c.at && cueT < c.until);
  const flash = Math.max(0, (progress - 0.86) / 0.14);  // light bloom on the pass
  const overPlane = planeFrac > 0.5;   // aircraft now fills the frame behind the cue

  return (
    <div
      className="fixed inset-0 z-[100] overflow-hidden select-none cursor-pointer"
      style={{
        opacity: leaving ? 0 : 1,
        transition: `opacity ${REVEAL_MS}ms ease-out`,
        background: has.sky
          ? undefined
          : 'linear-gradient(180deg, #3f86cf 0%, #5d9fdc 16%, #86bbe8 34%, #b4d5f0 52%, #d8e9f6 68%, #eee6dc 86%, #f7e6cf 100%)',
      }}
      onClick={finish}
      role="button"
      aria-label="Skip intro"
      data-progress={progress.toFixed(2)}
    >
      <style>{`
        @keyframes intro-rise { from { opacity:0; transform: translateY(12px);} to {opacity:1; transform:none;} }
      `}</style>

      {/* Sky backdrop — photo if supplied, else a layered atmospheric gradient */}
      {has.sky ? (
        <img
          src={ASSETS.sky} alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: `scale(${1 + progress * 0.18})`, transformOrigin: '50% 50%' }}
        />
      ) : (
        <>
          {/* low sun bloom, as in the reference */}
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(46% 26% at 50% 93%, rgba(255,238,208,0.85) 0%, rgba(255,231,196,0.35) 42%, rgba(255,255,255,0) 74%)',
          }} />
          {/* Cloud deck: layered fractal-noise clouds, pushed down and outward
              as the camera bores through them. */}
          <div
            className="absolute inset-x-0 bottom-0 h-[70%] pointer-events-none"
            style={{
              transform: `translateY(${progress * 16}%) scale(${1 + progress * 0.7})`,
              transformOrigin: '50% 100%',
            }}
          >
            <CloudLayer id="deck-far" freq="0.004 0.010" detail={5} seed={7} bias={0.55}
              className="absolute inset-x-0 bottom-0 w-full h-full" style={{ opacity: 0.55 }} />
            <CloudLayer id="deck-mid" freq="0.007 0.016" detail={5} seed={3} bias={0.42}
              className="absolute inset-x-0 bottom-0 w-full h-[78%]" style={{ opacity: 0.85 }} />
            <CloudLayer id="deck-near" freq="0.012 0.026" detail={4} seed={11} bias={0.3}
              className="absolute inset-x-0 bottom-0 w-full h-[52%]" style={{ opacity: 1 }} />
            {/* dense base so the deck reads as a surface below the flight path */}
            <div className="absolute inset-x-0 bottom-0 h-[34%]" style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.72) 58%, rgba(255,255,255,0.95) 100%)',
              filter: 'blur(4px)',
            }} />
          </div>
        </>
      )}

      {/* 3D corridor: clouds and the aircraft share one camera */}
      <div className="absolute inset-0" style={{ transformStyle: 'preserve-3d' }}>
        {CLOUDS.map((c, i) => {
          // Same approach law, offset in phase → near clouds rush, far ones drift.
          const k = approach(progress + c.phase) / F0;   // relative growth
          if (k > 90) return null;                        // swept past the lens
          const spread = k * 38;                          // radial flight off-screen
          const w = vw * c.size * Math.min(k * 0.22, 3.2);
          const fade = Math.min(1, k / 3) * Math.max(0, 1 - k / 70);
          return (
            <div
              key={i}
              className="absolute pointer-events-none"
              style={{
                left: '50%', top: '50%',
                width: w, height: w * 0.4,
                transform: `translate(-50%, -50%) translate(${c.dirX * spread}px, ${c.dirY * spread}px)`,
                opacity: 0.5 * fade,
                filter: `blur(${6 + k * 0.5}px)`,
                background: has.cloud ? undefined : 'radial-gradient(closest-side, rgba(255,255,255,0.95), rgba(255,255,255,0.5) 48%, rgba(255,255,255,0) 74%)',
                backgroundImage: has.cloud ? `url(${ASSETS.cloud})` : undefined,
                backgroundSize: has.cloud ? 'contain' : undefined,
                backgroundRepeat: 'no-repeat',
                willChange: 'transform, opacity',
              }}
            />
          );
        })}

        {/* The aircraft — front-facing, centred, travelling down the corridor */}
        {!passed && (
          <div
            className="absolute left-1/2 top-1/2 pointer-events-none"
            style={{
              transform: `translate(-50%, -50%) scale(${planeScale})`,
              opacity: progress < 0.02 ? progress / 0.02 : 1,
              willChange: 'transform',
            }}
          >
            {has.plane ? (
              <img src={ASSETS.plane} alt="" className="block max-w-none"
                style={{ width: BASE_W, filter: 'drop-shadow(0 12px 28px rgba(20,50,90,0.28))' }} />
            ) : (
              <FallbackPlane />
            )}
          </div>
        )}
      </div>

      {/* Branding — stage 1 only */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center pointer-events-none"
        style={{ opacity: Math.max(0, 1 - Math.max(0, cueT - 520) / 260), transition: 'none' }}
      >
        <h1 className="text-[12vw] sm:text-[56px] font-semibold tracking-tight text-[#12395f]">FlyIndex</h1>
        <p className="mt-2 text-[13px] sm:text-[15px] text-[#12395f]/70">Real-time Airfare Insights for a Smarter India</p>
        <div className="mt-4 h-px w-10 bg-[#12395f]/35" />
      </div>

      {/* Cue lines */}
      {cue && cue.lines.length > 0 && (
        <div
          key={cue.at}
          className={`absolute flex flex-col gap-1 pointer-events-none ${
            cue.align === 'right'
              ? 'top-1/2 right-[7%] -translate-y-1/2 items-end text-right'
              : 'bottom-[8%] left-1/2 -translate-x-1/2 items-center text-center'
          }`}
        >
          {cue.lines.map((l, i) => (
            <span key={l}
              className={`text-[15px] sm:text-[19px] font-medium tracking-tight ${
                overPlane ? 'text-white' : 'text-[#12395f]'
              }`}
              style={{
                animation: `intro-rise 420ms ease ${i * 110}ms both`,
                textShadow: overPlane ? '0 2px 10px rgba(10,40,70,0.55)' : undefined,
              }}>
              {l}
            </span>
          ))}
          <div className={`mt-1 h-px w-8 ${overPlane ? 'bg-white/60' : 'bg-[#12395f]/30'}`} />
        </div>
      )}

      {/* Light bloom as the aircraft crosses the lens */}
      {flash > 0 && (
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(45% 45% at 50% 52%, rgba(255,252,245,1) 0%, rgba(255,249,238,0.6) 40%, rgba(255,255,255,0) 72%)',
          opacity: flash,
        }} />
      )}

      <div className="absolute inset-0 bg-[#07070c] pointer-events-none"
        style={{ opacity: leaving ? 1 : 0, transition: `opacity ${REVEAL_MS}ms ease-in` }} />

      <button onClick={finish}
        className="absolute bottom-5 right-5 text-[12px] text-[#12395f]/55 hover:text-[#12395f] underline underline-offset-2">
        Skip
      </button>
    </div>
  );
}

/** Vector stand-in used until a photographic aircraft is supplied. */
function FallbackPlane() {
  return (
    <svg viewBox="0 0 240 110" className="block max-w-none" data-testid="intro-plane"
      style={{ width: BASE_W, filter: 'drop-shadow(0 12px 26px rgba(20,50,90,0.3))' }}>
      <g fill="#eef4fa" stroke="#9fb6cb" strokeWidth="1">
        <ellipse cx="120" cy="60" rx="15" ry="26" />
        <path d="M120 44c4 0 7 4 7 9s-3 8-7 8-7-3-7-8 3-9 7-9z" fill="#2c4a63" stroke="none" />
        <path d="M18 66c0-4 3-6 8-6l72-6v10l-72 8c-5 1-8-2-8-6z" />
        <path d="M222 66c0-4-3-6-8-6l-72-6v10l72 8c5 1 8-2 8-6z" />
        <rect x="116" y="8" width="8" height="34" rx="3" />
        <ellipse cx="72" cy="74" rx="15" ry="13" fill="#dde7f0" />
        <ellipse cx="168" cy="74" rx="15" ry="13" fill="#dde7f0" />
        <ellipse cx="72" cy="74" rx="8" ry="7" fill="#33526d" stroke="none" />
        <ellipse cx="168" cy="74" rx="8" ry="7" fill="#33526d" stroke="none" />
      </g>
    </svg>
  );
}
