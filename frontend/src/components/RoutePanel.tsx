import { useId } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, LabelList,
} from 'recharts';
import {
  Panel, PanelSkeleton, EmptyState, SERIES, STATUS, GRID, INK, tooltipStyle, inr, inrShort, axisTick, axisLabel, fmtLongDate,
} from './ui';
import { GLOSSARY } from '../lib/glossary';
import { routeLabel } from '../lib/cities';
import type { RouteTrend } from '../services/api';

export function FilterPanel({ routes, route, onRoute, dateFrom, dateTo, onDates, nonstop, onNonstop, onReset }: {
  routes: string[]; route: string; onRoute: (r: string) => void;
  dateFrom: string; dateTo: string; onDates: (from: string, to: string) => void;
  nonstop: boolean; onNonstop: (v: boolean) => void; onReset: () => void;
}) {
  const id = useId();
  return (
    <div className="card flex flex-wrap items-end gap-x-5 gap-y-3 px-4 py-4" role="group" aria-label="Filter prices">
      <div className="min-w-[240px] flex-1">
        <label htmlFor={`${id}-route`} className="mb-1 block text-[13px] font-medium text-ink-2">Route</label>
        <select id={`${id}-route`} value={route} onChange={e => onRoute(e.target.value)} className="field">
          {routes.map(r => <option key={r} value={r}>{routeLabel(r)}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-from`} className="mb-1 block text-[13px] font-medium text-ink-2">Travelling from</label>
        <input id={`${id}-from`} type="date" value={dateFrom} onChange={e => onDates(e.target.value, dateTo)} className="field" />
      </div>
      <div>
        <label htmlFor={`${id}-to`} className="mb-1 block text-[13px] font-medium text-ink-2">to</label>
        <input id={`${id}-to`} type="date" value={dateTo} min={dateFrom} onChange={e => onDates(dateFrom, e.target.value)} className="field" />
      </div>
      <label className="flex cursor-pointer items-center gap-2 pb-2 text-[14px] text-ink-2">
        <input type="checkbox" checked={nonstop} onChange={e => onNonstop(e.target.checked)} className="h-4 w-4 accent-accent" />
        Direct flights only
      </label>
      <button onClick={onReset} className="btn-ghost mb-0.5">Clear filters</button>
    </div>
  );
}

export function ElasticityChart({ trend }: { trend: RouteTrend | null }) {
  if (!trend) return <PanelSkeleton height={280} />;

  const title = <>When should you book?</>;
  if (!trend.available || trend.windows.every(w => w.actual_avg == null)) {
    return (
      <Panel title={title} info={GLOSSARY.daysBefore.short}>
        <EmptyState title="No prices for this route yet"
          message={trend.message ?? 'We need at least one day of prices for this route. Check back tomorrow.'} />
      </Panel>
    );
  }

  const best = trend.best_window;
  const rows = trend.windows.map(w => ({ ...w, tick: w.label ?? w.window }));
  const hasPred = trend.windows.some(w => w.predicted_avg != null);
  const label = routeLabel(trend.route);

  return (
    <Panel
      title={title}
      info={GLOSSARY.daysBefore.short}
      subtitle={<>{label}{trend.date ? <> · prices checked {fmtLongDate(trend.date)}</> : null}</>}
    >
      {best && (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-good/20 bg-good-soft px-4 py-3 text-[14px] text-ink">
          <span aria-hidden>✅</span>
          <span><b>Best time to book: {best.label}</b> — average {inr(best.avg_fare)},</span>
          <span><b className="text-good">{best.saving_pct}% cheaper</b> than booking {best.vs_label}.</span>
        </div>
      )}

      <div style={{ width: '100%', height: 280 }} role="img"
        aria-label={`Average fare for ${label} by how many days before the flight you book. ${
          rows.filter(r => r.actual_avg != null).map(r => `${r.tick}: ${inr(r.actual_avg!)}`).join('; ')}.`}>
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 20, right: 12, bottom: 22, left: 16 }} barCategoryGap="26%">
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="tick" stroke={GRID} tick={axisTick} tickLine={false} interval={0}
              label={axisLabel('Days before flight')} />
            <YAxis stroke={GRID} width={56} tick={axisTick} tickLine={false} axisLine={false}
              tickFormatter={inrShort} label={axisLabel('Fare (₹)', -90)} />
            <Tooltip
              contentStyle={tooltipStyle} cursor={{ fill: 'rgba(47,120,201,0.06)' }}
              formatter={(v: any, name: string) => [v == null ? '—' : inr(Number(v)), name === 'actual_avg' ? 'Average fare' : 'Our estimate']}
              labelFormatter={(l) => `Booked ${l}`}
            />
            <Legend verticalAlign="top" align="right" height={30}
              formatter={(v) => <span style={{ color: INK, fontSize: 13 }}>{v === 'actual_avg' ? 'Average fare' : 'Our estimate'}</span>} />
            <Bar dataKey="actual_avg" fill={SERIES.blue} radius={[6, 6, 0, 0]} maxBarSize={60}>
              {rows.map((r, i) => <Cell key={i} fill={best && r.window === best.window ? STATUS.good : SERIES.blue} />)}
              <LabelList dataKey="actual_avg" position="top"
                formatter={(v: any) => (v == null ? '' : inrShort(Number(v)))}
                style={{ fill: INK, fontSize: 12, fontWeight: 600 }} />
            </Bar>
            {hasPred && (
              <Line type="monotone" dataKey="predicted_avg" stroke={SERIES.orange} strokeWidth={2} strokeDasharray="6 4"
                connectNulls dot={{ r: 4, fill: SERIES.orange, strokeWidth: 2, stroke: '#ffffff' }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[13px] text-ink-3">
        {best && <>The green bar is the cheapest time to book. </>}
        {hasPred && <>The dashed line is <span className="font-medium text-ink-2">our estimate</span> — typically within about {trend.model?.holdout_mape_pct ?? 10}% of the real fare.</>}
      </p>

      {trend.carriers.length > 0 && (
        <>
          <h3 className="mb-2 mt-5 text-[14px] font-semibold text-ink">Average fare by airline</h3>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {trend.carriers.map(c => (
              <li key={c.carrier} className="rounded-xl border border-line bg-surface-2 px-3 py-2">
                <p className="truncate text-[13px] text-ink-2" title={c.carrier_name ?? c.carrier}>{c.carrier_name ?? c.carrier}</p>
                <p className="text-[16px] font-semibold tabular-nums text-ink">{inr(c.avg_fare)}</p>
                <p className="text-[12px] text-ink-3">{c.n} fare{c.n === 1 ? '' : 's'} checked</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
