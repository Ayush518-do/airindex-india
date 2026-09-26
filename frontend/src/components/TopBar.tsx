import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import ShinyText from './reactbits/ShinyText';
import { Badge, INK, SERIES } from './ui';
import { useMotionSettings } from '../lib/motion';
import { useAppData } from '../lib/appData';
import { API_DOCS_URL } from '../services/api';

export const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/routes', label: 'Routes' },
  { to: '/festivals', label: 'Festivals', tour: 'festivals-tab' },
  { to: '/official', label: 'Official data' },
  { to: '/alerts', label: 'My alerts', tour: 'alerts-tab' },
  { to: '/about', label: 'How it works' },
] as const;

export default function TopBar() {
  const { heavyEffects } = useMotionSettings();
  const { meta, alerts } = useAppData();
  const cheapCount = alerts?.alerts.filter(a => a.is_cheap).length ?? 0;
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const menuBtn = useRef<HTMLButtonElement>(null);

  // Close the mobile menu on navigation, and on Esc (returning focus to the button).
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenuOpen(false); menuBtn.current?.focus(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `relative shrink-0 rounded-lg px-3 py-1.5 text-[14px] transition-colors ${
      isActive ? 'bg-accent-soft font-semibold text-accent-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
    }`;

  const alertBadge = (
    <span className="ml-1.5 inline-grid h-5 min-w-5 place-items-center rounded-full bg-good px-1 text-[11px] font-bold text-white"
      aria-label={`${cheapCount} route${cheapCount === 1 ? '' : 's'} cheap today`}>
      {cheapCount}
    </span>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 py-2.5 md:px-8">
        <Link to="/" className="flex min-w-0 items-baseline gap-2 rounded-lg" aria-label="AIRINDEX INDIA — home">
          {/* Both ends of the shine gradient clear 4.5:1 on white. */}
          <ShinyText text="AIRINDEX INDIA" className="text-[17px] font-bold tracking-tight"
            color={INK} shineColor={SERIES.blue} speed={5} disabled={!heavyEffects} />
        </Link>

        <nav aria-label="Main" className="ml-4 hidden items-center gap-0.5 lg:flex">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={'end' in n ? n.end : undefined} className={linkClass}
              data-tour={'tour' in n ? n.tour : undefined}>
              {n.label}
              {n.to === '/alerts' && cheapCount > 0 && alertBadge}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* Demo mode must be unmistakable on every page and at every width.
              Driven only by meta.demo_mode, never inferred. */}
          {meta?.demo_mode && <Badge tone="warn">Demo data — not real fares</Badge>}
          {meta && !meta.demo_mode && (
            <span className="hidden sm:inline-flex">
              <Badge tone={meta.has_data ? 'good' : 'neutral'}>
                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${meta.has_data ? 'bg-good' : 'bg-ink-3'}`} />
                {meta.has_data
                  ? `Live · checked ${meta.snapshot_at ? new Date(meta.snapshot_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : ''}`
                  : 'No prices yet'}
              </Badge>
            </span>
          )}
          <a href={API_DOCS_URL} target="_blank" rel="noreferrer"
             className="hidden text-[13px] text-ink-3 underline-offset-2 hover:text-accent-ink hover:underline xl:inline">
            Data API ↗
          </a>
          <button
            ref={menuBtn}
            type="button"
            className="relative grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface text-ink lg:hidden"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen(o => !o)}
          >
            <span aria-hidden className="text-[18px] leading-none">{menuOpen ? '✕' : '☰'}</span>
            {!menuOpen && cheapCount > 0 && (
              <span aria-hidden className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-surface bg-good" />
            )}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav id="mobile-menu" aria-label="Main" className="border-t border-line bg-surface px-4 pb-4 pt-2 lg:hidden">
          <ul className="grid gap-1">
            {NAV.map(n => (
              <li key={n.to}>
                <NavLink to={n.to} end={'end' in n ? n.end : undefined}
                  className={({ isActive }) => `flex items-center rounded-lg px-3 py-2.5 text-[15px] ${
                    isActive ? 'bg-accent-soft font-semibold text-accent-ink' : 'text-ink-2 hover:bg-surface-2'}`}>
                  {n.label}
                  {n.to === '/alerts' && cheapCount > 0 && alertBadge}
                </NavLink>
              </li>
            ))}
          </ul>
          {meta && !meta.demo_mode && meta.has_data && meta.snapshot_at && (
            <p className="mt-3 px-3 text-[13px] text-ink-3">
              Prices last checked {new Date(meta.snapshot_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
        </nav>
      )}
    </header>
  );
}
