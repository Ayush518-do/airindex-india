import { useEffect, useState } from 'react';
import { Panel, Skeleton, EmptyState, ErrorState, inr } from './ui';
import { GLOSSARY } from '../lib/glossary';
import { routeLabel } from '../lib/cities';
import { friendlyError, getBestTime, type BestTime } from '../services/api';

/**
 * "Best day to book" for one route, in words: the booking window with the
 * lowest average fare across every day of prices we hold for the route.
 */
export default function BestTimeCard({ route }: { route: string }) {
  const [data, setData] = useState<BestTime | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setData(null); setError(null);
    getBestTime(route).then(d => alive && setData(d)).catch(e => alive && setError(friendlyError(e)));
    return () => { alive = false; };
  }, [route, attempt]);

  const title = 'Best time to book';
  if (error) return <Panel title={title}><ErrorState message={error} onRetry={() => setAttempt(a => a + 1)} /></Panel>;
  if (!data) {
    return (
      <Panel title={title}>
        <div className="space-y-2" role="status" aria-label="Loading the best time to book">
          <Skeleton className="h-7 w-3/4" /><Skeleton className="h-4 w-1/2" />
        </div>
      </Panel>
    );
  }
  if (!data.available || !data.best) {
    return (
      <Panel title={title} info={GLOSSARY.daysBefore.short}>
        <EmptyState icon="📅" title="Not enough prices yet"
          message={data.message ?? `We need more prices for ${routeLabel(route)} before we can say.`} />
      </Panel>
    );
  }

  return (
    <Panel title={title} info={GLOSSARY.daysBefore.short}
      subtitle={<>{routeLabel(data.route)} · based on {data.n_days} day{data.n_days === 1 ? '' : 's'} of prices</>}>
      <p className="text-[20px] font-semibold leading-snug text-ink">{data.summary}</p>
      {data.worst && data.saving_pct != null && data.saving_pct > 0 && (
        <p className="mt-2 text-[15px] text-ink-2">
          That's about <b className="text-good">{data.saving_pct}% cheaper</b> than booking {data.worst.label.toLowerCase()} (avg {inr(data.worst.avg_fare)}).
        </p>
      )}
      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label="Average fare by how far ahead you book">
        {data.windows.map(w => {
          const isBest = w.window === data.best!.window;
          return (
            <li key={w.window} className={`rounded-xl border px-3 py-2 ${isBest ? 'border-good/30 bg-good-soft' : 'border-line bg-surface-2'}`}>
              <p className="text-[13px] text-ink-2">{w.label}</p>
              <p className="text-[16px] font-semibold tabular-nums text-ink">{inr(w.avg_fare)}</p>
              {isBest && <p className="text-[12px] font-semibold text-good">Cheapest</p>}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
