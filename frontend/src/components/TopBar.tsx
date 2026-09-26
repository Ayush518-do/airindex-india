import ShinyText from './reactbits/ShinyText';
import { Badge, INK, SERIES } from './ui';
import { useMotionSettings } from '../lib/motion';
import { API_DOCS_URL, type Meta } from '../services/api';

export type Tab = 'overview' | 'festivals' | 'my-routes' | 'about';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Today' },
  { id: 'festivals', label: 'Festivals' },
  { id: 'my-routes', label: 'My alerts' },
  { id: 'about', label: 'How it works' },
];

export default function TopBar({
  meta, tab, onTab, alertCount = 0,
}: { meta: Meta | null; tab: Tab; onTab: (t: Tab) => void; alertCount?: number }) {
  const { heavyEffects } = useMotionSettings();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 md:px-8">
        <div className="flex min-w-0 items-baseline gap-2">
          {/* Both ends of the shine gradient clear 4.5:1 on white, so the
              wordmark stays readable at every frame of the animation. */}
          <ShinyText text="AIRINDEX INDIA" className="text-[17px] font-bold tracking-tight"
            color={INK} shineColor={SERIES.blue} speed={5} disabled={!heavyEffects} />
          <span className="hidden truncate text-[12px] text-ink-3 lg:inline">India's live airfare price index</span>
        </div>

        <div className="ml-auto flex items-center gap-2 md:order-3">
          {/* Demo mode must be unmistakable on every page and at every width —
              a demo screenshot should never pass for real prices. Driven only
              by meta.demo_mode, never inferred. */}
          {meta?.demo_mode && <Badge tone="warn">Demo data — not real fares</Badge>}
          {meta && !meta.demo_mode && (
            <Badge tone={meta.has_data ? 'good' : 'neutral'}>
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${meta.has_data ? 'bg-good' : 'bg-ink-3'}`} />
              {meta.has_data
                ? `Live · checked ${meta.snapshot_at ? new Date(meta.snapshot_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : ''}`
                : 'No prices yet'}
            </Badge>
          )}
          <a href={API_DOCS_URL} target="_blank" rel="noreferrer"
             className="hidden text-[13px] text-ink-3 underline-offset-2 hover:text-accent-ink hover:underline xl:inline">
            Data API ↗
          </a>
        </div>

        <nav aria-label="Main" className="-mx-1 flex w-full overflow-x-auto md:order-2 md:ml-6 md:w-auto">
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onTab(t.id)}
                aria-current={active ? 'page' : undefined}
                data-tour={t.id === 'festivals' ? 'festivals-tab' : t.id === 'my-routes' ? 'alerts-tab' : undefined}
                className={`relative mx-0.5 shrink-0 rounded-lg px-3 py-1.5 text-[14px] transition-colors ${
                  active ? 'bg-accent-soft font-semibold text-accent-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                }`}
              >
                {t.label}
                {t.id === 'my-routes' && alertCount > 0 && (
                  <span className="ml-1.5 inline-grid h-5 min-w-5 place-items-center rounded-full bg-good px-1 text-[11px] font-bold text-white"
                    aria-label={`${alertCount} route${alertCount === 1 ? '' : 's'} cheap today`}>
                    {alertCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
