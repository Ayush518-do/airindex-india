import { useEffect, useRef, useState } from 'react';
import { useMotionSettings } from '../lib/motion';

const POSTER = '/media/hero-cruise-poster.jpg';

/**
 * Should we stream video at all? Not under reduced motion (the still poster
 * replaces it), and not when the browser reports Data Saver or a 2G-class
 * connection — the poster is the same scene, so nothing is lost.
 * (Reduced motion always wins; the override below only beats the network check.)
 */
function videoWelcome(heavyEffects: boolean): boolean {
  if (!heavyEffects) return false;
  // Presenter override: venue Wi-Fi can report itself as "2g". ?video=1 forces
  // the video on, ?video=0 forces the still.
  const forced = new URLSearchParams(window.location.search).get('video');
  if (forced === '1') return true;
  if (forced === '0') return false;
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (c?.saveData) return false;
  if (c?.effectiveType && /(^|-)2g$/.test(c.effectiveType)) return false;
  return true;
}

/**
 * The landing page's full-bleed sky: a calm 8-second loop of flying alongside
 * the plane.
 *
 * Motion is deliberately small — no zoom. The frame is overscanned by 5% a
 * side so it can drift sideways a few percent over ~22 s (CSS), and shift a
 * touch opposite to the mouse for parallax. The poster is the first thing to
 * paint; the video streams in behind it and never blocks anything. If
 * autoplay is refused the poster simply stays.
 */
export default function HeroVideo() {
  const { heavyEffects, cursorEffects } = useMotionSettings();
  // Re-evaluated every render, so switching on "reduce motion" mid-visit swaps to the still.
  const useVideo = videoWelcome(heavyEffects);
  // Picked once at mount: the 1280w encode below 768 px, 1920w above.
  const [mobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const videoRef = useRef<HTMLVideoElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  // React doesn't reliably reflect `muted` to the DOM, and some browsers
  // refuse to autoplay without it. Set it directly, then ask politely.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.play().catch(() => { /* autoplay blocked: the poster stays, which is fine */ });
  }, [useVideo]);

  // Parallax: the sky moves slightly opposite to the cursor.
  useEffect(() => {
    if (!cursorEffects) return;
    const el = layerRef.current;
    if (!el) return;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const nx = e.clientX / window.innerWidth - 0.5;
        const ny = e.clientY / window.innerHeight - 0.5;
        el.style.transform = `translate3d(${(-nx * 1.6).toFixed(3)}%, ${(-ny * 0.9).toFixed(3)}%, 0)`;
      });
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => { cancelAnimationFrame(raf); window.removeEventListener('mousemove', onMove); };
  }, [cursorEffects]);

  const media = 'h-full w-full object-cover object-[68%_50%] md:object-center';

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-sky-2">
      {/* Overscanned so drift + parallax never reveal an edge. On desktop the
          frame is also set right of centre, so the plane sits on the right and
          the left third is open sky for the text (only the far wingtip is trimmed). */}
      <div className={`absolute -inset-y-[3%] -left-[5%] -right-[5%] md:-left-[4%] md:-right-[24%] ${useVideo ? 'hero-drift' : ''}`}>
        <div ref={layerRef} className="absolute inset-0 transition-transform duration-[1400ms] ease-out">
          {useVideo ? (
            <video
              ref={videoRef}
              className={media}
              poster={POSTER}
              autoPlay muted loop playsInline preload="auto"
              disablePictureInPicture
              tabIndex={-1}
            >
              {mobile ? (
                <source src="/media/hero-cruise-mobile.mp4" type="video/mp4" />
              ) : (
                <>
                  <source src="/media/hero-cruise.webm" type="video/webm" />
                  <source src="/media/hero-cruise.mp4" type="video/mp4" />
                </>
              )}
            </video>
          ) : (
            <img src={POSTER} alt="" className={media} />
          )}
        </div>
      </div>
    </div>
  );
}
