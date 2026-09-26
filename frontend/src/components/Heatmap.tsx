import { Fragment } from 'react';
import { EmptyState, Panel, SEQ_RAMP, heatLabel, inr } from './ui';
import { GLOSSARY } from '../lib/glossary';
import { cityLabel, routeLabel } from '../lib/cities';
import type { Heatmap as HeatmapData } from '../services/api';

export default function Heatmap({ data, windowShort, selectedRoute, onSelectRoute }: {
  data: HeatmapData; windowShort: Record<string, string>; selectedRoute: string; onSelectRoute: (r: string) => void;
}) {
  if (!data.available || data.cells.length === 0) {
    return (
      <Panel title="Prices by route and booking time" info={GLOSSARY.heatmap.short}>
        <EmptyState title="No prices to map yet" message={data.message ?? 'Prices appear here after the next daily check.'} />
      </Panel>
    );
  }

  const fares = data.cells.map(c => c.avg_fare);
  const min = Math.min(...fares), max = Math.max(...fares);
  const lookup = new Map(data.cells.map(c => [`${c.route}|${c.window}`, c]));
  const shade = (v: number) => {
    const t = max === min ? 0 : (v - min) / (max - min);
    return SEQ_RAMP[Math.min(SEQ_RAMP.length - 1, Math.round(t * (SEQ_RAMP.length - 1)))];
  };
  const when = (w: string) => windowShort[w] ?? `${w} days ahead`;

  return (
    <Panel
      title="Prices by route and booking time"
      info={GLOSSARY.heatmap.short}
      subtitle={<>Average fare for each route · <b className="font-semibold text-ink-2">darker = more expensive</b> · tap a route to see its details below</>}
    >
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div
          role="grid"
          aria-label="Average fare by route and how many days before the flight it was booked"
          className="grid min-w-[660px] gap-[3px]"
          style={{ gridTemplateColumns: `168px repeat(${data.windows.length}, minmax(0, 1fr))` }}
        >
          <div role="columnheader" className="self-end pb-1 text-[12px] font-semibold text-ink-3">Route</div>
          {data.windows.map(w => (
            <div key={w} role="columnheader" className="pb-1 text-center text-[12px] font-semibold leading-tight text-ink-3">
              {when(w)}
            </div>
          ))}

          {data.routes.map(r => {
            const [o, d] = r.split('-');
            const selected = r === selectedRoute;
            return (
              <Fragment key={r}>
                <button
                  role="rowheader"
                  onClick={() => onSelectRoute(r)}
                  aria-pressed={selected}
                  aria-label={`Show details for ${routeLabel(r)}`}
                  className={`rounded-lg px-2 py-1 text-left leading-tight transition-colors ${
                    selected ? 'bg-accent-soft text-accent-ink' : 'text-ink-2 hover:bg-surface-2'
                  }`}
                >
                  <span className="block text-[13px] font-semibold">{cityLabel(o)}</span>
                  <span className="block text-[12px]">→ {cityLabel(d)}</span>
                </button>
                {data.windows.map(w => {
                  const c = lookup.get(`${r}|${w}`);
                  if (!c) {
                    return (
                      <div key={w} role="gridcell" aria-label={`${routeLabel(r)}, ${when(w)}: no flights found`}
                        className="grid h-12 place-items-center rounded-md bg-surface-2 text-[13px] text-ink-3">—</div>
                    );
                  }
                  const bg = shade(c.avg_fare);
                  return (
                    <button
                      key={w}
                      role="gridcell"
                      onClick={() => onSelectRoute(r)}
                      aria-label={`${routeLabel(r)}, booked ${when(w)}: average ${inr(c.avg_fare)} from ${c.n} fares`}
                      title={`${routeLabel(r)} · booked ${when(w)} · average ${inr(c.avg_fare)} (${c.n} fares)`}
                      className={`h-12 rounded-md text-[13px] font-semibold tabular-nums transition-transform hover:scale-[1.04] ${
                        selected ? 'ring-2 ring-accent ring-offset-1' : ''
                      }`}
                      style={{ background: bg, color: heatLabel(bg) }}
                    >
                      {inr(c.avg_fare)}
                    </button>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3">
        <span>Cheaper <b className="font-semibold text-ink-2">{inr(min)}</b></span>
        <div aria-hidden className="h-2.5 w-40 rounded-full"
          style={{ background: `linear-gradient(90deg, ${SEQ_RAMP[0]}, ${SEQ_RAMP[4]}, ${SEQ_RAMP[SEQ_RAMP.length - 1]})` }} />
        <span>More expensive <b className="font-semibold text-ink-2">{inr(max)}</b></span>
        <span className="ml-auto">Columns: how many days before the flight you book →</span>
      </div>
    </Panel>
  );
}
