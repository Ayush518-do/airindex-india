import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/*
 * When does the intro play? On every full page load of "/" (F5, a new tab,
 * typing the URL) — but not when the visitor comes back to "/" from inside
 * the app, so it doesn't replay during normal browsing.
 *
 * Nothing is stored: this flag lives in the loaded JavaScript, so a full load
 * starts it at false and any in-app route change sets it. That is exactly
 * the line between "page load" and "navigation".
 */
let navigatedInApp = false;
let firstKey: string | null = null;

/** Mount once inside the router: records the first in-app route change. */
export function InAppNavigationTracker() {
  const { key } = useLocation();
  useEffect(() => {
    // Compare with the first location seen rather than counting renders, so
    // React's development double-run of effects can't mark a fresh load.
    if (firstKey === null) firstKey = key;
    else if (key !== firstKey) navigatedInApp = true;
  }, [key]);
  return null;
}

/**
 * Play the intro? Every full page load, unless reduced motion is on.
 *
 * `locationKey` is the current router location. The landing page renders
 * before the tracker's effect sees a new location, so both checks matter:
 * a key other than the first one means we arrived by navigating (e.g. the
 * logo on /home), and the flag covers Back to the very first entry.
 */
export function shouldPlayIntro(reducedMotion: boolean, locationKey: string): boolean {
  if (reducedMotion || navigatedInApp) return false;
  return firstKey === null || locationKey === firstKey;
}

type Phase = 'playing' | 'white' | 'reveal';

// Pacing. The ~5 s clip plays at 1.5x (~3.3 s), then a brief white hold and a
// quick cross-fade — calm, but no waiting around.
const PLAYBACK_RATE = 1.5;
const TO_WHITE_MS = 200;    // video fades out to the white it ends on
const WHITE_HOLD_MS = 150;
const CROSSFADE_MS = 600;   // white -> clouds

/**
 * Step 1 of the landing sequence: the ~5 s intro, full screen, nothing on top
 * but a small "Skip intro" button. The plane appears in the distance, comes
 * closer, flies past and the frame ends in white.
 *
 * Then: hold soft white for 0.15 s, and cross-fade (0.6 s) to the clouds behind,
 * which are already rendered underneath — so it feels like the plane has
 * just flown away. `onReveal` fires as the cross-fade starts (the page's
 * content begins its entrance then); `onDone` when the overlay is gone.
 *
 * Never blocks anything: the page and its data load underneath from the
 * start. If autoplay is refused, the video errors, or it hasn't started
 * within 2.5 s (slow connection), it goes straight to the reveal.
 */
export default function IntroVideo({ onReveal, onDone }: { onReveal: () => void; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>('playing');
  const [mobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const videoRef = useRef<HTMLVideoElement>(null);
  const started = useRef(false);
  const cb = useRef({ onReveal, onDone });
  cb.current = { onReveal, onDone };

  // Lock scrolling while the intro covers the page.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true; // React doesn't reliably reflect `muted`, and autoplay needs it
    v.defaultPlaybackRate = PLAYBACK_RATE;
    v.playbackRate = PLAYBACK_RATE;
    let slow = 0;
    const start = () => {
      v.play().catch(() => reveal(true));
      slow = window.setTimeout(() => { if (!started.current) reveal(true); }, 2500);
    };
    // Opened in a background tab? Chrome won't play video there, so wait
    // until the tab is actually shown rather than skipping the intro unseen.
    const onVisible = () => { if (!document.hidden) { document.removeEventListener('visibilitychange', onVisible); start(); } };
    if (document.hidden) document.addEventListener('visibilitychange', onVisible);
    else start();
    return () => { clearTimeout(slow); document.removeEventListener('visibilitychange', onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc skips, like the button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') toWhite(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const phaseRef = useRef<Phase>('playing');
  const go = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  /** Video ended or skipped: soft white, hold, then reveal. */
  function toWhite() {
    if (phaseRef.current !== 'playing') return;
    go('white');
    videoRef.current?.pause();
    window.setTimeout(() => reveal(false), TO_WHITE_MS + WHITE_HOLD_MS);
  }

  /** Cross-fade to the clouds. `instant` = the video never ran, so no white hold. */
  function reveal(instant: boolean) {
    if (phaseRef.current === 'reveal') return;
    go('reveal');
    cb.current.onReveal();
    window.setTimeout(() => cb.current.onDone(), instant ? 350 : CROSSFADE_MS);
  }

  return (
    <div
      className={`fixed inset-0 z-[100] bg-white transition-opacity ease-in-out ${
        phase === 'reveal' ? 'pointer-events-none opacity-0 duration-[600ms]' : 'opacity-100 duration-200'}`}
    >
      <video
        ref={videoRef}
        aria-hidden
        tabIndex={-1}
        className={`h-full w-full object-cover transition-opacity duration-200 ${phase === 'playing' ? 'opacity-100' : 'opacity-0'}`}
        poster="/media/intro-poster.jpg"
        autoPlay muted playsInline preload="auto"
        disablePictureInPicture
        // Some browsers reset the rate when the media loads; set it again once it can play.
        onCanPlay={e => { e.currentTarget.playbackRate = PLAYBACK_RATE; }}
        onPlaying={() => { started.current = true; }}
        onEnded={toWhite}
        onError={() => reveal(true)}
      >
        {mobile ? (
          <source src="/media/intro-mobile.mp4" type="video/mp4" />
        ) : (
          <>
            <source src="/media/intro.webm" type="video/webm" />
            <source src="/media/intro.mp4" type="video/mp4" />
          </>
        )}
      </video>

      {phase === 'playing' && (
        <button
          type="button"
          onClick={toWhite}
          className="absolute bottom-5 right-5 rounded-full border border-white/70 bg-white/55 px-4 py-2 text-[13px] font-semibold text-ink shadow-card backdrop-blur-md transition-colors hover:bg-white/80 sm:bottom-8 sm:right-8"
        >
          Skip intro <span aria-hidden>→</span>
        </button>
      )}
    </div>
  );
}
