import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import SkyBackdrop from './SkyBackdrop';
import TopBar from './TopBar';
import Guide, { guideDone } from './Guide';
import { ErrorState, inr } from './ui';
import { routeLabel } from '../lib/cities';
import { useAppData } from '../lib/appData';

/**
 * The frame around every page: background, top bar, the "backend is down"
 * state (shown once here, with Retry, instead of every page failing on its
 * own), the cheap-fare banner, and the first-visit tour on Home.
 */
export default function Layout() {
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

  const onHome = location.pathname === '/home';
  // Arriving from the landing page, which faded to white: fade in from white.
  const fromLanding = (location.state as { fromLanding?: boolean } | null)?.fromLanding === true;
  // Once the fade has run, drop the flag so a reload doesn't replay it.
  useEffect(() => {
    if (!fromLanding) return;
    const t = window.setTimeout(() => navigate(location.pathname + location.search, { replace: true, state: null }), 900);
    return () => clearTimeout(t);
  }, [fromLanding, location.pathname, location.search, navigate]);
  const forceTour = params.get('tour') === '1';

  // First-visit tour — Home only, once there is data to point at.
  useEffect(() => {
    if (!onHome || loading || error || !daily?.available) { setShowGuide(false); return; }
    if (!forceTour && guideDone()) return;
    const t = window.setTimeout(() => setShowGuide(true), 600);
    return () => clearTimeout(t);
  }, [onHome, forceTour, loading, error, daily]);

  const closeGuide = () => {
    setShowGuide(false);
    if (forceTour) navigate('/home', { replace: true });
  };

  const cheap = alerts?.alerts.filter(a => a.is_cheap) ?? [];

  return (
    <div className="relative min-h-screen">
      <SkyBackdrop />
      {fromLanding && <div aria-hidden key={location.key} className="white-fade pointer-events-none fixed inset-0 z-[90] bg-white" />}

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
            AIRINDEX INDIA · built for the Ministry of Statistics (MoSPI) · not an official statistic.
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
