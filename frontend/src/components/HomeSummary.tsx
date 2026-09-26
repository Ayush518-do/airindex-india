import { MagnetButton } from './Motion';
import { fmtDate, inr } from './ui';
import { routeLabel } from '../lib/cities';
import type { Heatmap, IndexDaily } from '../services/api';

const DAY = 864e5;

/**
 * The first thing on the home screen: what's happening, in one or two plain
 * sentences. It only claims what the data supports — "than last week" needs a
 * point a week back; with less history it names the actual comparison date,
 * and with a single day it says so.
 */
function priceMovement(daily: IndexDaily): string | null {
  const pts = daily.points;
  if (pts.length === 0 || !daily.latest) return null;
  if (pts.length === 1) return 'This is our first day of prices, so there is nothing to compare with yet.';

  const latest = pts[pts.length - 1];
  const latestT = new Date(latest.date).getTime();
  const weekAgo = [...pts].reverse().find(p => latestT - new Date(p.date).getTime() >= 7 * DAY);
  const ref = weekAgo ?? pts[0];
  const change = (latest.value / ref.value - 1) * 100;
  const when = weekAgo ? 'last week' : `on ${fmtDate(ref.date)}`;

  if (Math.abs(change) < 0.5) return `Today, flights cost about the same as ${when}.`;
  return `Today, flights are on average ${Math.abs(change).toFixed(1)}% ${change < 0 ? 'cheaper' : 'more expensive'} than ${when}.`;
}

function cheapestNow(heatmap: Heatmap, windowShort: Record<string, string>) {
  if (!heatmap.available || heatmap.cells.length === 0) return null;
  const c = heatmap.cells.reduce((a, b) => (b.avg_fare < a.avg_fare ? b : a));
  return { route: c.route, fare: c.avg_fare, when: windowShort[c.window] ?? c.window };
}

/** Across routes, how much booking early saves versus last minute. */
function earlySaving(heatmap: Heatmap): number | null {
  if (!heatmap.available) return null;
  const by = new Map(heatmap.cells.map(c => [`${c.route}|${c.window}`, c.avg_fare]));
  const savings = heatmap.routes
    .map(r => [by.get(`${r}|0-3`), by.get(`${r}|31-60`)])
    .filter((p): p is [number, number] => p[0] != null && p[1] != null)
    .map(([late, early]) => (1 - early / late) * 100);
  if (savings.length === 0) return null;
  return savings.reduce((a, b) => a + b, 0) / savings.length;
}

export default function HomeSummary({ daily, heatmap, windowShort, onSetAlert }: {
  daily: IndexDaily; heatmap: Heatmap; windowShort: Record<string, string>; onSetAlert: () => void;
}) {
  const movement = priceMovement(daily);
  const cheap = cheapestNow(heatmap, windowShort);
  const early = earlySaving(heatmap);

  return (
    <section aria-label="Today's summary"
      className="card relative overflow-hidden border-accent/15 bg-gradient-to-br from-surface via-surface to-accent-soft/60 p-5 sm:p-6">
      <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-accent-ink">Today at a glance</p>
      {movement && <p className="mt-2 max-w-3xl text-[20px] font-semibold leading-snug text-ink sm:text-[22px]">{movement}</p>}
      {!movement && <p className="mt-2 text-[18px] font-semibold text-ink">We're still collecting our first prices.</p>}

      <ul className="mt-3 space-y-1.5 text-[15px] leading-relaxed text-ink-2">
        {cheap && (
          <li>
            <span aria-hidden>✈️ </span>Cheapest flight to book right now: <b className="text-ink">{routeLabel(cheap.route)}</b>,
            around <b className="text-ink">{inr(cheap.fare)}</b> if you book {cheap.when}.
          </li>
        )}
        {early != null && early > 1 && (
          <li>
            <span aria-hidden>📅 </span>Booking 1–2 months ahead instead of at the last minute saves about{' '}
            <b className="text-good">{early.toFixed(0)}%</b> on average.
          </li>
        )}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <MagnetButton>
          <button onClick={onSetAlert} className="btn-primary">🔔 Tell me when fares drop</button>
        </MagnetButton>
        <span className="text-[13px] text-ink-3">Free email alert — no account needed.</span>
      </div>
    </section>
  );
}
