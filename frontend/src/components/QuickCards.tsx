import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { InfoTip, Skeleton, inr, fmtDate } from './ui';
import { GLOSSARY } from '../lib/glossary';
import { routeLabel } from '../lib/cities';
import {
  getBestTime, getFestivalSurge, getFestivalCalendar, type BestTime, type Festival, type FestivalSurge, type Heatmap, type Meta,
} from '../services/api';

function QuickCard({ title, info, icon, children, to, cta }: {
  title: string; info?: ReactNode; icon: string; children: ReactNode; to: string; cta: string;
}) {
  return (
    <article className="card flex h-full flex-col p-5">
      <h2 className="flex items-center gap-2 text-[14px] font-semibold text-ink-2">
        <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-sky-soft text-[16px]">{icon}</span>
        {title}
        {info && <InfoTip>{info}</InfoTip>}
      </h2>
      <div className="mt-3 flex-1 text-[15px] leading-relaxed text-ink-2">{children}</div>
      <Link to={to} className="mt-4 inline-flex items-center gap-1 self-start text-[14px] font-semibold text-accent-ink underline-offset-2 hover:underline">
        {cta} <span aria-hidden>→</span>
      </Link>
    </article>
  );
}

const Loading = () => (
  <div className="space-y-2" role="status" aria-label="Loading">
    <Skeleton className="h-6 w-4/5" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" />
  </div>
);

export default function QuickCards({ meta, heatmap }: { meta: Meta; heatmap: Heatmap }) {
  // The busiest route (highest weight) is the most useful single example.
  const busiest = [...meta.route_details].sort((a, b) => b.weight - a.weight)[0]?.route ?? meta.routes[0];
  const [best, setBest] = useState<BestTime | null>(null);
  const [bestErr, setBestErr] = useState(false);
  const [surge, setSurge] = useState<FestivalSurge | null>(null);
  const [surgeErr, setSurgeErr] = useState(false);
  const [calendar, setCalendar] = useState<Festival[] | null>(null);

  useEffect(() => {
    getBestTime(busiest).then(setBest).catch(() => setBestErr(true));
    // The calendar says which festival is next; the surge table (if it has
    // fares for it yet) says how much prices jump.
    Promise.all([getFestivalCalendar(), getFestivalSurge()])
      .then(([c, s]) => { setCalendar(c.festivals); setSurge(s); })
      .catch(() => setSurgeErr(true));
  }, [busiest]);

  // 1. Cheapest fare on the price map today
  const cheapest = heatmap.available && heatmap.cells.length
    ? heatmap.cells.reduce((a, b) => (b.avg_fare < a.avg_fare ? b : a)) : null;
  const [co, cd] = cheapest ? cheapest.route.split('-') : ['', ''];

  // 3. The next festival that hasn't ended, and how much its fares jump
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const nextFestival = [...(calendar ?? [])].sort((a, b) => a.start.localeCompare(b.start)).find(f => f.end >= today);
  const rows = surge?.surge.filter(s => s.festival === nextFestival?.name) ?? [];
  const avgJump = rows.length ? rows.reduce((a, s) => a + s.surge_pct, 0) / rows.length : null;
  const biggest = rows.length ? rows.reduce((a, b) => (b.surge_pct > a.surge_pct ? b : a)) : null;

  return (
    <div data-tour="quick" className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <QuickCard title="Cheapest route today" icon="✈️"
        to={cheapest ? `/routes?from=${co}&to=${cd}` : '/routes'} cta="See route prices">
        {cheapest ? (
          <>
            <p className="text-[17px] font-semibold text-ink">{routeLabel(cheapest.route)}</p>
            <p>Around <b className="text-ink">{inr(cheapest.avg_fare)}</b> if you book {meta.window_short[cheapest.window] ?? cheapest.window}.</p>
          </>
        ) : (
          <p>We'll show the cheapest route after the next daily price check.</p>
        )}
      </QuickCard>

      <QuickCard title="Best time to book" icon="📅" info={GLOSSARY.daysBefore.short}
        to={`/routes?from=${busiest.split('-')[0]}&to=${busiest.split('-')[1]}`} cta="Check your route">
        {bestErr ? <p>We couldn't load this just now.</p> : !best ? <Loading /> : best.available && best.best ? (
          <>
            <p className="text-[17px] font-semibold text-ink">{best.summary}</p>
            <p>On {routeLabel(best.route)}, our busiest route{best.saving_pct ? <> — about <b className="text-good">{best.saving_pct}% cheaper</b> than booking {best.worst?.label}</> : null}.</p>
          </>
        ) : (
          <p>{best.message}</p>
        )}
      </QuickCard>

      <QuickCard title="Next festival price jump" icon="🪔" info={GLOSSARY.festival.short}
        to="/festivals" cta="See festival prices">
        {surgeErr ? <p>We couldn't load this just now.</p> : !surge || !calendar ? <Loading /> : !nextFestival ? (
          <p>No upcoming festivals in our calendar right now.</p>
        ) : avgJump != null && biggest ? (
          <>
            <p className="text-[17px] font-semibold text-ink">
              {nextFestival.name}: fares {avgJump >= 0 ? `about ${avgJump.toFixed(0)}% higher` : `about ${Math.abs(avgJump).toFixed(0)}% lower`}
            </p>
            <p>
              For travel {fmtDate(nextFestival.start)} – {fmtDate(nextFestival.end)}. Biggest jump:{' '}
              {routeLabel(biggest.route)} ({biggest.surge_pct > 0 ? '+' : ''}{biggest.surge_pct.toFixed(0)}%).
            </p>
          </>
        ) : (
          <>
            <p className="text-[17px] font-semibold text-ink">{nextFestival.name}, {fmtDate(nextFestival.start)} – {fmtDate(nextFestival.end)}</p>
            <p>We haven't checked flights on these dates yet — they'll appear as the dates get closer.</p>
          </>
        )}
      </QuickCard>
    </div>
  );
}
