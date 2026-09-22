import ShinyText from './reactbits/ShinyText';
import { Badge } from './ui';
import { API_DOCS_URL, type Meta } from '../services/api';

export type Tab = 'overview' | 'festivals' | 'my-routes';

const TABS: { id: Tab; label: string; enabled: boolean }[] = [
  { id: 'overview', label: 'Overview', enabled: true },
  { id: 'festivals', label: 'Festivals', enabled: true },
  { id: 'my-routes', label: 'My Routes', enabled: true },
];

export default function TopBar({
  meta, tab, onTab, alertCount = 0,
}: { meta: Meta | null; tab: Tab; onTab: (t: Tab) => void; alertCount?: number }) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.07] bg-[rgba(10,10,18,0.78)] backdrop-blur-xl">
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 h-14 flex items-center gap-4">
        <div className="flex items-baseline gap-2 min-w-0">
          <ShinyText text="AIRINDEX INDIA" className="text-[16px] font-bold tracking-tight" color="#c9c6f0" shineColor="#ffffff" speed={4} />
          <span className="hidden sm:inline text-[11px] text-white/35 truncate">Real-time Airfare Price Index · APIx</span>
        </div>

        <nav className="ml-auto flex items-center gap-1" aria-label="Sections">
          {TABS.map(t => (
            <button
              key={t.id}
              disabled={!t.enabled}
              onClick={() => onTab(t.id)}
              className={`rounded-lg px-3 py-1.5 text-[13px] transition-colors border ${
                tab === t.id
                  ? 'bg-[#7c5cff]/18 text-white font-medium border-[#7c5cff]/30'
                  : 'text-white/55 hover:text-white hover:bg-white/[0.05] border-transparent disabled:opacity-35 disabled:hover:bg-transparent'
              }`}
              title={t.enabled ? undefined : 'Coming in a later step'}
            >
              {t.label}
              {t.id === 'my-routes' && alertCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-emerald-400/25 text-emerald-200 text-[10px] font-semibold h-4 min-w-4 px-1">{alertCount}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2 pl-3 border-l border-white/[0.07]">
          {meta && (
            <Badge tone={meta.data_mode === 'fake' ? 'warn' : 'good'}>
              {meta.data_mode === 'fake'
                ? 'FAKE DATA'
                : `CACHED SNAPSHOT${meta.snapshot_at ? ' · ' + new Date(meta.snapshot_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}`}
            </Badge>
          )}
          <a href={API_DOCS_URL} target="_blank" rel="noreferrer"
             className="text-[12px] text-white/50 hover:text-white underline-offset-2 hover:underline">
            API docs ↗
          </a>
        </div>
      </div>
    </header>
  );
}
