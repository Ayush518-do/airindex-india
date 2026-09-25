// Intro-splash gating. Kept out of the component file so React Fast Refresh
// stays happy (a module exporting both a component and plain functions can't
// be hot-reloaded cleanly).

const SESSION_KEY = 'airindex_intro_seen';

/**
 * Plays once per browser tab. `?intro=1` forces a replay (handy for demos and
 * for tuning the animation); `?intro=0` skips it.
 */
export function shouldShowIntro(): boolean {
  if (typeof window === 'undefined') return false;

  const forced = new URLSearchParams(window.location.search).get('intro');
  if (forced === '1') return true;
  if (forced === '0') return false;

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    return sessionStorage.getItem(SESSION_KEY) !== '1';
  } catch {
    return true;
  }
}

export function markIntroSeen() {
  try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* private mode etc. */ }
}
