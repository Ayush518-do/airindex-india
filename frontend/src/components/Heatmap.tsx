import { Fragment, useState } from 'react';
import { Panel, SEQ_RAMP, inr } from './ui';
import type { Heatmap as HeatmapData } from '../services/api';

export default function Heatmap({ data, selectedRoute, onSelectRoute }: {
  data: HeatmapData; selectedRoute: string; onSelectRoute: (r: string) => void;
}) {
  const [hover, setHover] = useState<{ route: string; window: string } | null>(null);
  const fares = data.cells.map(c => c.avg_fare);
  const min = Math.min(...fares), max = Math.max(...fares);
  const lookup = new Map(data.cells.map(c => [`${c.route}|${c.window}`, c]));
  const color = (v: number) => {
    const t = max === min ? 0 : (v - min) / (max - min);
    return SEQ_RAMP[Math.min(SEQ_RAMP.length - 1, Math.round(t * (SEQ_RAMP.length - 1)))];
  };

  return (
    <Panel title="Sector × advance-purchase heatmap" subtitle="Average total fare (INR) in the latest snapshot · brighter = pricier · click a row to select the route">
      <div className="overflow-x-auto -mx-1 px-1">
        <div
          className="grid gap-[2px] min-w-[560px]"
          style={{ gridTemplateColumns: `96px repeat(${data.windows.length}, minmax(0, 1fr))` }}
          role="table"
        >
          <div />
          {data.windows.map(w => (
            <div key={w} className="text-center text-[11px] font-medium text-white/50 pb-1" role="columnheader">{w} d</div>
          ))}
          {data.routes.map(r => (
            <Fragment key={r}>
              <button
                onClick={() => onSelectRoute(r)}
                className={`text-left text-[12.5px] font-medium pr-2 rounded-l-md transition-colors ${
                  r === selectedRoute ? 'text-white' : 'text-white/60 hover:text-white'
                }`}
                role="rowheader"
              >
                {r === selectedRoute && <span className="text-[#9085e9] mr-1">▸</span>}{r}
              </button>
              {data.windows.map(w => {
                const c = lookup.get(`${r}|${w}`);
                const isHover = hover?.route === r && hover?.window === w;
                return (
                  <button
                    key={`${r}-${w}`}
                    role="cell"
                    onMouseEnter={() => setHover({ route: r, window: w })}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => onSelectRoute(r)}
                    title={c ? `${r} · ${w} days out · ${inr(c.avg_fare)} (${c.n} fares)` : ''}
                    className={`h-10 rounded-[4px] text-[12px] font-medium tabular-nums transition-transform ${isHover ? 'scale-[1.04] z-10' : ''} ${
                      r === selectedRoute ? 'ring-1 ring-white/30' : ''
                    }`}
                    style={{ background: c ? color(c.avg_fare) : '#1e1e2a', color: '#fff' }}
                  >
                    {c ? inr(c.avg_fare) : '—'}
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-white/40">
        <span>{inr(min)}</span>
        <div className="h-2 flex-1 max-w-[220px] rounded-full" style={{ background: `linear-gradient(90deg, ${SEQ_RAMP[0]}, ${SEQ_RAMP[SEQ_RAMP.length - 1]})` }} />
        <span>{inr(max)}</span>
      </div>
    </Panel>
  );
}
