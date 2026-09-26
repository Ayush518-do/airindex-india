import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Aurora from './reactbits/Aurora';
import TopBar from './TopBar';
import Guide, { guideDone } from './Guide';
import { ErrorState, inr } from './ui';
import { routeLabel } from '../lib/cities';
import { useMotionSettings } from '../lib/motion';
import { useAppData } from '../lib/appData';

/**
 * The frame around every page: background, top bar, the "backend is down"
 * state (shown once here, with Retry, instead of every page failing on its
 * own), the cheap-fare banner, and the first-visit tour on Home.
 */
export default function Layout({ introActive = false }: { introActive?: boolean }) {
  const { heavyEffects } = useMotionSettings();
  const { meta, daily, loading, error, reload, alerts } = useAppData();
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  // New page: start at the top, and move keyboard/screen-reader focus to the
  // content so the next Tab doesn't begin back in the old page's position.
  useEffect(() => {
    window.scrollTo({ top: 0 });
    if (firstRender.current) { firstRender.current = false; return; }
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  const onHome = location.pathname === '/';
  const forceTour = params.get('tour') === '1';

  // First-visit tour — Home only, after the intro, once there's data to point at.
  useEffect(() => {
    if (!onHome || introActive || loading || error || !daily?.available) { setShowGuide(false); return; }
    if (!forceTour && guideDone()) return;
    const t = window.setTimeout(() => setShowGuide(true), 600);
    return () => clearTimeout(t);
  }, [onHome, forceTour, introActive, loading, error, daily]);

  const closeGuide = () => {
    setShowGuide(false);
    if (forceTour) navigate('/', { replace: true });
  };

  const cheap = alerts?.alerts.filter(a => a.is_cheap) ?? [];

  return (
    <div className="relative min-h-screen">
      {/* Slowly drifting pastel sky behind the top of the page, dimmed and faded
          into the page colour (Aurora's light mode is opaque and saturated). */}
      {heavyEffects && (
        <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[70vh] opacity-45">
          <Aurora colorStops={['#9cc4f2', '#c3b6fb', '#a8d8f5']} amplitude={0.8} blend={0.7} speed={0.35} lightMode />
        </div>
      )}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[70vh] bg-gradient-to-b from-transparent via-page/40 to-page" />

      <TopBar />

      <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto max-w-[1280px] space-y-5 px-4 py-6 outline-none md:px-8 md:py-8">
        {error ? (
          <ErrorState
            message={`${error} The prices on this site come from our server, so nothing can load until it's reachable again.`}
            onRetry={reload}
          />
        ) : (
          <>
            {cheap.length > 0 && !bannerDismissed && (
              <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-good/25 bg-good-soft px-4 py-3">
                <span className="text-[15px] font-semibold text-good">Good time to book!</span>
                <span className="text-[14px] text-ink-2">
                  {cheap.map(a => `${a.label ?? routeLabel(a.route)} is ${a.pct_below_baseline}% cheaper than usual (${inr(a.today_fare ?? 0)})`).join(' · ')}
                </span>
                <Link to="/alerts" className="text-[14px] font-semibold text-good underline underline-offset-2">See my alerts</Link>
                <button onClick={() => setBannerDismissed(true)} className="ml-auto rounded px-1 text-[16px] text-ink-3 hover:text-ink"
                  aria-label="Dismiss this message">✕</button>
              </div>
            )}
            <Outlet />
          </>
        )}

        {meta && (
          <footer className="pb-6 pt-2 text-[13px] leading-relaxed text-ink-3">
            A Smart India Hackathon 2026 project for MoSPI · not an official statistic.
            {meta.snapshot_at && <> Prices last checked {new Date(meta.snapshot_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.</>}
            {meta.demo_mode && <> <b className="text-warn">Demo mode is on — the price history includes example data.</b></>}
          </footer>
        )}
      </main>

      {showGuide && onHome && <Guide onClose={closeGuide} />}
    </div>
  );
}

/** Sets the browser tab title for a page. */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · AIRINDEX INDIA`;
  }, [title]);
}
