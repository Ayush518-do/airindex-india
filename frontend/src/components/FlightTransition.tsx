import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMotionSettings } from '../lib/motion';

const CLIP = '/media/transition.mp4';

/**
 * "Explore today's fares": the plane whooshes past the camera, the screen
 * goes white, and the dashboard fades in from white.
 *
 * `go(to)` plays the 1.2 s clip full-screen, then navigates with
 * `state.fromFlight` so Layout runs the white fade-in. Every failure path just
 * navigates: reduced motion, Data Saver, a refused play(), a decode error, or
 * the clip not finishing within 3 s. Esc or a click skips it. The clip is
 * preloaded a few seconds after the landing page settles, so it's ready by
 * the time anyone clicks, without competing with the hero video.
 */
export function useFlightTransition() {
  const { heavyEffects } = useMotionSettings();
  const navigate = useNavigate();
  const [target, setTarget] = useState<string | null>(null);
  const [preload, setPreload] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setPreload(true), 2500);
    return () => clearTimeout(t);
  }, []);

  const saveData = !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  const enabled = heavyEffects && !saveData;

  const go = useCallback((to: string) => {
    if (!enabled) { navigate(to); return; }
    setTarget(to);
  }, [enabled, navigate]);

  const overlay = (enabled && (preload || target)) ? (
    <FlightOverlay
      active={target != null}
      onDone={(played) => { const to = target ?? '/home'; setTarget(null); navigate(to, { state: { fromFlight: played } }); }}
    />
  ) : null;

  return { go, overlay, enabled };
}

function FlightOverlay({ active, onDone }: { active: boolean; onDone: (played: boolean) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const done = useRef(false);
  // Shown only once frames are flowing, so there is never a blank white flash.
  const [playing, setPlaying] = useState(false);
  const started = useRef(false);

  const finish = useCallback((played: boolean) => {
    if (done.current) return;
    done.current = true;
    onDone(played);
  }, [onDone]);

  useEffect(() => {
    if (!active) return;
    done.current = false;
    setPlaying(false);
    started.current = false;
    const v = ref.current;
    if (!v) { finish(false); return; }
    v.muted = true;
    v.currentTime = 0;
    v.play().catch(() => finish(false));
    const guard = window.setTimeout(() => finish(started.current), 3000);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish(started.current); };
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(guard); document.removeEventListener('keydown', onKey); };
  }, [active, finish]);

  return (
    <div
      aria-hidden
      onClick={() => active && finish(started.current)}
      className={`fixed inset-0 z-[100] bg-white transition-opacity duration-150 ${active && playing ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
    >
      <video
        ref={ref}
        src={CLIP}
        className="h-full w-full object-cover"
        muted playsInline preload="auto"
        tabIndex={-1}
        onPlaying={() => { started.current = true; setPlaying(true); }}
        onEnded={() => finish(true)}
        onError={() => active && finish(false)}
      />
    </div>
  );
}
