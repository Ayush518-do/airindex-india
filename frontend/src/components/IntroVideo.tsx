import { useEffect, useRef, useState } from 'react';

const SESSION_KEY = 'airindex_intro_seen';

/**
 * Play the intro? Once per browser session (tab), never under reduced motion.
 * `?intro=1` forces a replay (handy for demos), `?intro=0` skips it.
 */
export function shouldPlayIntro(reducedMotion: boolean): boolean {
  if (reducedMotion) return false;
  const forced = new URLSearchParams(window.location.search).get('intro');
  if (forced === '1') return true;
  if (forced === '0') return false;
  try { return sessionStorage.getItem(SESSION_KEY) !== '1'; } catch { return false; }
}

function markSeen() {
  try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* private mode */ }
}

type Phase = 'playing' | 'white' | 'reveal';

/**
 * Step 1 of the landing sequence: the ~5 s intro, full screen, nothing on top
 * but a small "Skip intro" button. The plane appears in the distance, comes
 * closer, flies past and the frame ends in white.
 *
 * Then: hold soft white for 0.3 s, and cross-fade (1 s) to the clouds behind,
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

  // Seen as soon as it starts, so a reload in the same tab goes straight to the page.
  useEffect(() => { markSeen(); }, []);

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
    window.setTimeout(() => reveal(false), 300 + 200); // 0.2 s fade to white + 0.3 s hold
  }

  /** Cross-fade to the clouds. `instant` = the video never ran, so no white hold. */
  function reveal(instant: boolean) {
    if (phaseRef.current === 'reveal') return;
    go('reveal');
    cb.current.onReveal();
    window.setTimeout(() => cb.current.onDone(), instant ? 350 : 1000);
  }

  return (
    <div
      className={`fixed inset-0 z-[100] bg-white transition-opacity ease-in-out ${
        phase === 'reveal' ? 'pointer-events-none opacity-0 duration-1000' : 'opacity-100 duration-200'}`}
    >
      <video
        ref={videoRef}
        aria-hidden
        tabIndex={-1}
        className={`h-full w-full object-cover transition-opacity duration-200 ${phase === 'playing' ? 'opacity-100' : 'opacity-0'}`}
        poster="/media/intro-poster.jpg"
        autoPlay muted playsInline preload="auto"
        disablePictureInPicture
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
